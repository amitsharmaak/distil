import { closeStrictMswServer, createStrictMswServer, resetStrictMswServer } from "./msw";

/**
 * Import this module once from Jest's setupFilesAfterEnv to enforce the
 * no-unmocked-network rule for every deterministic suite.
 */
export const externalServiceMockServer = createStrictMswServer();

afterEach(() => {
  resetStrictMswServer(externalServiceMockServer);
});

afterAll(() => {
  closeStrictMswServer(externalServiceMockServer);
});
