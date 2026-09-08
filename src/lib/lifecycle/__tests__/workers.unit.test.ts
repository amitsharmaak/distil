jest.mock("@/lib/lifecycle/exports", () => ({
  processAccountExport: jest.fn(),
  purgeExpiredAccountExport: jest.fn(),
}));
jest.mock("@/lib/lifecycle/deletion", () => ({ processAccountDeletion: jest.fn() }));

import { processAccountDeletion } from "@/lib/lifecycle/deletion";
import { processAccountExport, purgeExpiredAccountExport } from "@/lib/lifecycle/exports";
import {
  createAccountDeletionJobHandler,
  createAccountExportJobHandler,
  createAccountExportRetentionJobHandler,
} from "@/lib/lifecycle/workers";

const exportId = "20000000-0000-4000-8000-000000000020";
const retentionJobId = "30000000-0000-4000-8000-000000000030";
const context = { userId: "10000000-0000-4000-8000-000000000010" } as never;
const repositories = {} as never;
const objectStore = {} as never;
const deletionDependencies = {} as never;

describe("account lifecycle job handlers", () => {
  beforeEach(() => jest.clearAllMocks());

  it("validates and delegates export work", async () => {
    await createAccountExportJobHandler(objectStore)(
      context,
      { exportId, jobId: exportId },
      repositories
    );

    expect(processAccountExport).toHaveBeenCalledWith(context, repositories, objectStore, {
      exportId,
      jobId: exportId,
    });
  });

  it("validates and delegates retention work by export resource id", async () => {
    await createAccountExportRetentionJobHandler(objectStore)(
      context,
      { exportId, jobId: retentionJobId },
      repositories
    );

    expect(purgeExpiredAccountExport).toHaveBeenCalledWith(
      context,
      repositories,
      objectStore,
      exportId
    );
  });

  it("rejects forged deletion resource/job pairs before purge work", async () => {
    const handler = createAccountDeletionJobHandler(deletionDependencies);

    await expect(
      handler(context, { deletionId: exportId, jobId: retentionJobId }, repositories)
    ).rejects.toThrow("Deletion job/resource mismatch");
    expect(processAccountDeletion).not.toHaveBeenCalled();
  });

  it("validates and delegates deletion work", async () => {
    await createAccountDeletionJobHandler(deletionDependencies)(
      context,
      { deletionId: exportId, jobId: exportId },
      repositories
    );

    expect(processAccountDeletion).toHaveBeenCalledWith(
      context,
      repositories,
      deletionDependencies,
      { deletionId: exportId, jobId: exportId }
    );
  });

  it("rejects malformed queue payloads before any lifecycle work", async () => {
    await expect(
      createAccountExportJobHandler(objectStore)(context, { exportId }, repositories)
    ).rejects.toThrow();
    await expect(
      createAccountExportRetentionJobHandler(objectStore)(
        context,
        { exportId, jobId: "not-a-uuid" },
        repositories
      )
    ).rejects.toThrow();
    expect(processAccountExport).not.toHaveBeenCalled();
    expect(purgeExpiredAccountExport).not.toHaveBeenCalled();
  });
});
