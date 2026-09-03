import { http, passthrough } from "msw";
import { closeStrictMswServer, createStrictMswServer, resetStrictMswServer } from "./msw";

/**
 * Import this module once from Jest's setupFilesAfterEnv to enforce the
 * no-unmocked-network rule for every deterministic suite.
 */
export const externalServiceMockServer = createStrictMswServer({
  handlers: [
    http.all(/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\//, () => passthrough()),
  ],
});

afterEach(() => {
  resetStrictMswServer(externalServiceMockServer);
});

afterAll(() => {
  closeStrictMswServer(externalServiceMockServer);
});
