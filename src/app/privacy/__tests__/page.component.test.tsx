/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";

import PrivacyPage from "../page";

describe("PrivacyPage", () => {
  it("states what the extension sends and when", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The browser extension" })).toBeInTheDocument();
    expect(screen.getByText(/only sends data when you save something/)).toBeInTheDocument();
    expect(
      screen.getByText(/the address \(URL\) of the page or link you saved/)
    ).toBeInTheDocument();
    expect(screen.getByText(/the page title/)).toBeInTheDocument();
    expect(screen.getByText(/any text you had selected/)).toBeInTheDocument();
    expect(screen.getByText(/does not read your browsing history/)).toBeInTheDocument();
  });

  it("names AI processing, storage, and the export and deletion controls", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/third-party AI model providers/)).toBeInTheDocument();
    expect(screen.getByText(/does not sell your data/)).toBeInTheDocument();
    expect(screen.getByText(/export your data and delete your account/)).toBeInTheDocument();
  });
});
