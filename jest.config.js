module.exports = {
    testEnvironment: "node",
    roots: ["<rootDir>/test"],
    testPathIgnorePatterns: ["/node_modules/", "<rootDir>/test/similarStudent.test.ts"],
    testMatch: ["**/*.test.ts"],
    transform: {
        "^.+\\.tsx?$": "ts-jest"
    }
};
