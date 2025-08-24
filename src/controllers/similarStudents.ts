import pkg from "pg";
const { Client } = pkg;
import OpenAI from "openai";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const evalModel = "gpt-4o-mini";
const defaultNumberOfMatches = 10;

// Type definitions
interface LeadData {
    id: string;
    bachelor_school?: string;
    bachelor_program_name?: string;
    bachelor_gpa?: string;
    master_school?: string;
    master_program_name?: string;
    master_gpa?: string;
    intended_program_level?: string;
    intended_programs?: string;
    intended_direction?: string;
    [key: string]: string | number | boolean | null | undefined; // Allow additional properties
}

interface SimilarStudent {
    mongo_id: string;
    text: string;
    distance: number;
}

interface AIEvaluationResult {
    topMatches: MatchItem[];
}

interface MatchItem {
    mongoId: string;
    reason: string;
}

interface DbConfig {
    connectionString?: string;
    ssl: boolean | { rejectUnauthorized: boolean };
    connectionTimeoutMillis: number;
    idleTimeoutMillis: number;
}

interface Timer {
    operation: string;
    start: number;
    end: () => number;
}

interface LogContext {
    [key: string]: string | number | boolean | null | undefined;
}

// Validate required environment variables
const requiredEnvVars: string[] = ["OPENAI_API_KEY", "POSTGRES_URI"];

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);
if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(", ")}`);
}

// Initialize OpenAI client with error handling
let openai: OpenAI;
try {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY!,
        timeout: 30000, // 30 second timeout
        maxRetries: 2
    });
} catch (error) {
    console.error("Failed to initialize OpenAI client:", error);
    throw error;
}

// PostgreSQL connection configuration
const dbConfig: DbConfig = {
    connectionString: process.env.POSTGRES_URI!,
    ssl: true,
    // Add connection timeout and other options
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
};

// Debug function to log connection config (without password)
function logConnectionConfig(): void {
    const safeConfig = { ...dbConfig };
    // Redact the connection string to avoid leaking secrets
    safeConfig.connectionString = dbConfig.connectionString ? "<redacted>" : undefined;
    delete (safeConfig as Record<string, unknown>).password;
    console.log("Database connection config:", safeConfig);
}

/**
 * Enhanced logging utility with timing and context
 */
const logWithContext = (level: string, message: string, context: LogContext = {}): void => {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        ...context
    };
    console.log(JSON.stringify(logEntry));
};

/**
 * Performance timer utility
 */
const createTimer = (operation: string): Timer => {
    const start = Date.now();
    return {
        operation,
        start,
        end: (): number => {
            const duration = Date.now() - start;
            logWithContext("INFO", `${operation} completed`, {
                duration: `${duration}ms`
            });
            return duration;
        }
    };
};

/**
 * Memory usage utility
 */
const logMemoryUsage = (context: string = ""): void => {
    const usage = process.memoryUsage();
    logWithContext("INFO", "Memory usage", {
        context,
        heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(usage.external / 1024 / 1024)}MB`,
        rss: `${Math.round(usage.rss / 1024 / 1024)}MB`
    });
};

/**
 * Validate and sanitize leadId input
 */
function validateLeadId(leadId: unknown): string | null {
    if (!leadId || typeof leadId !== "string") {
        return null;
    }

    // Remove any potentially harmful characters and trim
    const sanitized = leadId.trim().replace(/[^\w-]/g, "");

    // Check if it's a reasonable length (adjust based on your ID format)
    if (sanitized.length < 1 || sanitized.length > 100) {
        return null;
    }

    return sanitized;
}

/**
 * Validate lead data before processing
 */
function validateLeadData(leadData: LeadData): boolean {
    if (!leadData || typeof leadData !== "object") {
        return false;
    }

    // Check if at least one meaningful field exists
    const meaningfulFields: (keyof LeadData)[] = [
        "bachelor_school",
        "bachelor_program_name",
        "bachelor_gpa",
        "master_school",
        "master_program_name",
        "master_gpa",
        "intended_program_level",
        "intended_programs",
        "intended_direction"
    ];

    return meaningfulFields.some(
        (field) =>
            leadData[field] &&
            leadData[field] !== "-" &&
            leadData[field]!.toString().trim().length > 0
    );
}

/**
 * Custom error classes for better error handling
 */
class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ValidationError";
    }
}

class DatabaseError extends Error {
    public originalError?: Error;

    constructor(message: string, originalError?: Error) {
        super(message);
        this.name = "DatabaseError";
        this.originalError = originalError;
    }
}

class OpenAIError extends Error {
    public originalError?: Error;

    constructor(message: string, originalError?: Error) {
        super(message);
        this.name = "OpenAIError";
        this.originalError = originalError;
    }
}

/**
 * Helper function to safely format lines for text preparation
 */
function safeLine(label: string, value: string | number | boolean | null | undefined): string {
    return value && value !== "-" ? `${label}: ${value}` : "";
}

/**
 * Helper function to join non-empty lines
 */
function joinLines(...lines: string[]): string {
    return lines.filter(Boolean).join("\n");
}

/**
 * Prepare text for embedding from lead data
 */
function prepareTextForEmbedding(leadData: LeadData): string {
    return joinLines(
        // Academic background
        safeLine("Bachelor School", leadData.bachelor_school),
        safeLine("Bachelor Program", leadData.bachelor_program_name),
        safeLine("Bachelor GPA", leadData.bachelor_gpa),

        safeLine("Master School", leadData.master_school),
        safeLine("Master Program", leadData.master_program_name),
        safeLine("Master GPA", leadData.master_gpa),

        // Application plan
        safeLine("Intended Program Level", leadData.intended_program_level),
        safeLine("Intended Programs", leadData.intended_programs),
        safeLine("Intended Direction", leadData.intended_direction)
    );
}

/**
 * Get lead data from PostgreSQL with improved error handling
 */
async function getLeadData(client: InstanceType<typeof Client>, leadId: string): Promise<LeadData> {
    try {
        const query = `
      SELECT * FROM leads 
      WHERE id = $1 
      LIMIT 1
    `;

        const result = await client.query(query, [leadId]);

        if (result.rows.length === 0) {
            throw new ValidationError(`Lead with ID ${leadId} not found`);
        }

        return result.rows[0] as LeadData;
    } catch (error) {
        if (error instanceof ValidationError) {
            throw error;
        }
        throw new DatabaseError("Failed to retrieve lead data", error as Error);
    }
}

/**
 * Generate embedding using OpenAI with improved error handling
 */
async function generateEmbedding(text: string): Promise<number[]> {
    try {
        if (!text || text.trim().length === 0) {
            throw new ValidationError("Text for embedding cannot be empty");
        }

        const response = await openai.embeddings.create({
            model: "text-embedding-3-large",
            input: text
        });

        if (!response.data || !response.data[0] || !response.data[0].embedding) {
            throw new OpenAIError("Invalid response from OpenAI embeddings API");
        }

        return response.data[0].embedding;
    } catch (error) {
        if (error instanceof ValidationError) {
            throw error;
        }
        throw new OpenAIError("Failed to generate embedding", error as Error);
    }
}

/**
 * Find similar students using cosine distance with improved error handling
 */
async function findSimilarStudents(
    client: InstanceType<typeof Client>,
    embedding: number[]
): Promise<SimilarStudent[]> {
    try {
        if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
            throw new ValidationError("Invalid embedding vector provided");
        }

        const query = `
      SELECT mongo_id, text, embedding <=> $1 AS distance
      FROM student_embeddings
      ORDER BY distance ASC
      LIMIT 50
    `;

        const result = await client.query(query, [JSON.stringify(embedding)]);
        return result.rows as SimilarStudent[];
    } catch (error) {
        if (error instanceof ValidationError) {
            throw error;
        }
        throw new DatabaseError("Failed to find similar students", error as Error);
    }
}

/**
 * Prepare prompt for AI model to evaluate similarity
 */
function preparePrompt(
    inputText: string,
    similarStudents: SimilarStudent[],
    numberMatches: number = defaultNumberOfMatches
): string {
    let promptText = `You are an AI assistant matching student profiles.

New student profile:
${inputText}

Candidate students (use only these IDs):
`;

    similarStudents.forEach((student) => {
        // Include distance to help the model gauge closeness
        promptText += `ID: ${student.mongo_id} | distance: ${student.distance.toFixed(4)} | ${student.text}\n`;
    });

    promptText += `
Task:
- Select up to ${numberMatches} strong matches.
- If at least ${numberMatches} strong matches exist, you must return exactly ${numberMatches}.
- Only use IDs from the provided list. Do not invent or alter IDs.
- Prioritize (in order): same/related degree or program; similar GPA; overlap in subject interests or target universities.
- Be pragmatic: if several are reasonably strong, include them—do not be overly strict.
- If fewer than ${numberMatches} strong matches exist, return all strong matches (possibly zero).
- For each match, provide a concise reason in Traditional Chinese and English, combined into ONE string and separated by " | ".
    Format exactly: "繁中: <reason in Traditional Chinese> | EN: <reason in English>".
    Keep each language concise (e.g., EN ≤ 12 words; 繁中 ≤ 30 characters).
- Output strict JSON only. No markdown, no comments.

Output JSON schema:
{
  "topMatches": [
        { "mongoId": "<one of the provided IDs>", "reason": "<短理由> | <short reason>" }
  ]
}

Example (10 items shown purely as format guidance):
{
  "topMatches": [
        { "mongoId": "id_1", "reason": "同系所與相近GPA，目標學校重疊 | Same CS program, similar GPA, shared target schools" },
        { "mongoId": "id_2", "reason": "繁中: 機械領域相近，GPA接近，聚焦機器人 | Mechanical Eng, close GPA, robotics focus" },
        { "mongoId": "id_3", "reason": "數據科學碩士，課程與目標相符 | Data Science master, similar coursework and goals" },
        { "mongoId": "id_4", "reason": "電機方向相符，GPA區間一致 | EE program overlap, matching GPA range" },
        { "mongoId": "id_5", "reason": "商業分析興趣相同，GPA相近 | Business analytics interest, near-identical GPA" },
        { "mongoId": "id_6", "reason": "同校相近科系，GPA對齊 | Same university, adjacent program, GPA aligned" },
        { "mongoId": "id_7", "reason": "數學密集課程與目標相似 | Similar math-heavy curriculum and targets" },
        { "mongoId": "id_8", "reason": "皆為資工且聚焦AI，GPA相近 | Both CS with AI focus, GPA within 0.1" },
        { "mongoId": "id_9", "reason": "同學位層級與專業方向，GPA接近 | Same degree level and specialization, close GPA" },
        { "mongoId": "id_10", "reason": "目標學校與申請方向重疊 | Overlap in target schools and program direction" }
  ]
}`;
    return promptText;
}

/**
 * Get AI evaluation of similar students with improved error handling
 */
async function getAIEvaluation(prompt: string): Promise<AIEvaluationResult> {
    try {
        if (!prompt || prompt.trim().length === 0) {
            throw new ValidationError("Prompt for AI evaluation cannot be empty");
        }

        const response = await openai.chat.completions.create({
            model: evalModel,
            messages: [
                {
                    role: "system",
                    content:
                        "You return strict JSON only. Follow the user instructions precisely. Never output markdown."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            response_format: { type: "json_object" }
        });

        if (!response.choices || !response.choices[0] || !response.choices[0].message) {
            throw new OpenAIError("Invalid response from OpenAI chat API");
        }

        const content = response.choices[0].message.content;
        if (!content) {
            throw new OpenAIError("Empty response content from OpenAI");
        }

        const parsed = JSON.parse(content) as AIEvaluationResult;

        // Validate the response format
        if (!parsed.topMatches || !Array.isArray(parsed.topMatches)) {
            throw new OpenAIError("AI response does not contain valid topMatches array");
        }

        // Validate each match item has mongoId and reason
        for (const match of parsed.topMatches) {
            if (!match.mongoId || typeof match.mongoId !== "string") {
                throw new OpenAIError("Match item missing valid mongoId property");
            }
            if (!match.reason || typeof match.reason !== "string") {
                throw new OpenAIError("Match item missing valid reason property");
            }
        }

        return parsed;
    } catch (error) {
        if (error instanceof ValidationError || error instanceof OpenAIError) {
            throw error;
        }
        if (error instanceof SyntaxError) {
            throw new OpenAIError("Failed to parse AI response as JSON", error);
        }
        throw new OpenAIError("Failed to get AI evaluation", error as Error);
    }
}

/**
 * Insert matched students into lead_similar_users table
 * Using parameterized queries for better security and reliability
 */
async function insertMatchedStudents(
    client: InstanceType<typeof Client>,
    leadId: string,
    topMatches: MatchItem[]
): Promise<void> {
    try {
        if (!topMatches || topMatches.length === 0) {
            return;
        }

        logWithContext("INFO", "Preparing to insert matched students", {
            leadId,
            matchCount: topMatches.length
        });

        // First, delete any existing matches for this lead to prevent duplicates
        try {
            const deleteQuery = `DELETE FROM lead_similar_users WHERE lead_id = $1`;
            await client.query(deleteQuery, [leadId]);
            logWithContext("INFO", "Deleted existing matches", { leadId });
        } catch (deleteError) {
            logWithContext("WARN", "Failed to delete existing matches", {
                leadId,
                error: (deleteError as Error).message
            });
            // Continue with insertion even if delete fails
        }

        const values = topMatches.map((m, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(", ");
        const params = [leadId, ...topMatches.flatMap((m) => [m.mongoId, m.reason])];
        const query = `INSERT INTO lead_similar_users (lead_id, mongo_id, reason) VALUES ${values} ON CONFLICT DO NOTHING`;
        await client.query(query, params);
    } catch (error) {
        // Log detailed error information for debugging
        const err = error as Error;
        logWithContext("ERROR", "Failed to insert matched students", {
            leadId,
            error: err.message,
            stack: err.stack
        });

        throw new DatabaseError(
            `Failed to insert matched students: ${err.message}`,
            error as Error
        );
    }
}

/**
 * Main Lambda handler with improved error handling and validation
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const requestTimer = createTimer("Full request processing");
    logMemoryUsage("Request start");

    let client: InstanceType<typeof Client> | undefined;

    try {
        // Validate event structure
        if (!event) {
            throw new ValidationError("Event object is required");
        }

        logWithContext("INFO", "Request started", {
            eventType: typeof event,
            hasQueryParams: !!event.queryStringParameters
        });

        // Extract and validate leadId
        const rawLeadId = event.queryStringParameters?.leadId;
        const leadId = validateLeadId(rawLeadId);

        if (!leadId) {
            logWithContext("WARN", "Invalid leadId provided", {
                rawLeadId: typeof rawLeadId === "string" ? rawLeadId : String(rawLeadId)
            });
            return {
                statusCode: 400,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    error: "Invalid or missing leadId parameter",
                    details: "leadId must be a non-empty string with valid characters"
                })
            };
        }

        logWithContext("INFO", "Processing lead", { leadId });

        // Initialize database connection
        const dbTimer = createTimer("Database connection");
        client = new Client(dbConfig);

        // Connect to database with timeout
        logWithContext("INFO", "Attempting database connection");
        logConnectionConfig();

        await client.connect();
        dbTimer.end();
        logWithContext("INFO", "Database connected successfully");

        // Step 1: Get lead data
        const leadTimer = createTimer("Lead data retrieval");
        const leadData = await getLeadData(client, leadId);
        leadTimer.end();

        // Validate lead data
        if (!validateLeadData(leadData)) {
            logWithContext("WARN", "No meaningful lead data found", { leadId });
            return {
                statusCode: 200,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    leadId: leadId,
                    message: "No meaningful data found for lead",
                    matches: [],
                    processingTime: requestTimer.end()
                })
            };
        }

        // Step 2: Prepare text for embedding
        const textTimer = createTimer("Text preparation");
        const inputText = prepareTextForEmbedding(leadData);
        textTimer.end();

        if (!inputText.trim()) {
            logWithContext("WARN", "No text generated from lead data", { leadId });
            return {
                statusCode: 200,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    leadId: leadId,
                    message: "No text could be generated from lead data",
                    matches: [],
                    processingTime: requestTimer.end()
                })
            };
        }

        logWithContext("INFO", "Text prepared for embedding", {
            leadId,
            textLength: inputText.length,
            preview: inputText.substring(0, 100) + "..."
        });

        // Step 3: Generate embedding
        const embeddingTimer = createTimer("OpenAI embedding generation");
        const embedding = await generateEmbedding(inputText);
        embeddingTimer.end();

        // Step 4: Find similar students
        const similarTimer = createTimer("Similar students search");
        const similarStudents = await findSimilarStudents(client, embedding);
        similarTimer.end();

        if (similarStudents.length === 0) {
            logWithContext("INFO", "No similar students found", { leadId });
            return {
                statusCode: 200,
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    leadId: leadId,
                    inputProfile: inputText,
                    message: "No similar students found",
                    matches: [],
                    processingTime: requestTimer.end()
                })
            };
        }

        logWithContext("INFO", "Similar students found", {
            leadId,
            count: similarStudents.length
        });

        // Parse optional limit (?limit=1..10)
        const rawLimit = event.queryStringParameters?.limit;
        const requestedLimit = (() => {
            const n = typeof rawLimit === "string" ? parseInt(rawLimit, 10) : NaN;
            if (Number.isNaN(n)) return defaultNumberOfMatches;
            return Math.min(Math.max(n, 1), defaultNumberOfMatches);
        })();
        logWithContext("INFO", "Using requested limit", { requestedLimit });

        // Step 5: Prepare prompt for AI evaluation
        const promptTimer = createTimer("LLM prompt preparation");
        const prompt = preparePrompt(inputText, similarStudents, requestedLimit);
        promptTimer.end();

        // Step 6: Get LLM evaluation
        const aiTimer = createTimer("LLM evaluation");
        const aiResult = await getAIEvaluation(prompt);
        aiTimer.end();

        // Step 7: Insert matched students into database
        const insertTimer = createTimer("Insert matched students");

        await insertMatchedStudents(client, leadId, aiResult.topMatches);
        insertTimer.end();

        const processingTime = requestTimer.end();
        logMemoryUsage("Request end");

        logWithContext("INFO", "Request completed successfully", {
            leadId,
            totalSimilarFound: similarStudents.length,
            matches: aiResult.topMatches?.length || 0,
            processingTime: `${processingTime}ms`
        });

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                leadId: leadId,
                matches: aiResult.topMatches,
                processingTime: processingTime
            })
        };
    } catch (error) {
        const processingTime = requestTimer.end();
        logMemoryUsage("Request error");

        const err = error as Error;
        logWithContext("ERROR", "Request failed", {
            error: err.message,
            stack: err.stack,
            processingTime: `${processingTime}ms`
        });

        // Log additional details for debugging
        if ((err as Error & { originalError?: Error }).originalError) {
            const errorWithOriginal = err as Error & { originalError: Error };
            logWithContext("ERROR", "Original error details", {
                originalError: errorWithOriginal.originalError.message,
                originalStack: errorWithOriginal.originalError.stack || "No stack trace"
            });
        }

        let statusCode = 500;
        let errorMessage = "Internal server error";
        const errorDetails = err.message;

        // Set appropriate status codes based on error type
        if (error instanceof ValidationError) {
            statusCode = 400;
            errorMessage = "Validation error";
        } else if (error instanceof DatabaseError) {
            statusCode = 503;
            errorMessage = "Database error";
        } else if (error instanceof OpenAIError) {
            statusCode = 502;
            errorMessage = "AI service error";
        }

        return {
            statusCode: statusCode,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                error: errorMessage,
                details: errorDetails,
                processingTime: processingTime
            })
        };
    } finally {
        // Ensure database connection is always closed
        if (client) {
            try {
                const closeTimer = createTimer("Database connection close");
                await client.end();
                closeTimer.end();
                logWithContext("INFO", "Database connection closed");
            } catch (closeError) {
                logWithContext("ERROR", "Error closing database connection", {
                    error: (closeError as Error).message
                });
            }
        }
    }
};
