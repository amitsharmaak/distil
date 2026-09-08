import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { phase3DependencyPolicyFindings } from "../support/dependency-policy";

describe("Phase 3 offline dependency/license policy", () => {
  it("revalidates the frozen lock without registry or advisory calls", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    const packageLock = JSON.parse(
      readFileSync(resolve(process.cwd(), "package-lock.json"), "utf8")
    );
    expect(phase3DependencyPolicyFindings(packageJson, packageLock)).toEqual([
      {
        id: "invalid-auth-peer",
        package: "@better-auth/api-key",
        detail: "requires better-auth ^1.7.3 but Neon Auth UI resolves 1.6.23",
      },
      {
        id: "prohibited-license",
        package: "@triplit/client@1.0.50",
        detail: "production dependency declares AGPL-3.0-only",
      },
      {
        id: "prohibited-license",
        package: "ua-parser-js@2.0.10",
        detail: "production dependency declares AGPL-3.0-or-later",
      },
    ]);
  });

  it("passes a pinned, compatible, permissively licensed graph", () => {
    expect(
      phase3DependencyPolicyFindings(
        { dependencies: { "@neondatabase/auth": "0.5.0-beta" } },
        {
          packages: {
            "node_modules/@neondatabase/auth": { version: "0.5.0-beta", license: "Apache-2.0" },
            "node_modules/@neondatabase/auth-ui/node_modules/better-auth": {
              version: "1.7.3",
              license: "MIT",
            },
            "node_modules/@neondatabase/auth-ui/node_modules/@daveyplate/better-auth-ui/node_modules/@better-auth/api-key":
              {
                version: "1.7.3",
                license: "MIT",
                peerDependencies: { "better-auth": "^1.7.3" },
              },
          },
        }
      )
    ).toEqual([]);
  });
});
