import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TwoFactorChallenge } from "../TwoFactorChallenge";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("TwoFactorChallenge", () => {
  it("shows the masked email and completes sign-in with a valid code", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ data: { verified: true } }));
    const onVerified = vi.fn();
    render(<TwoFactorChallenge maskedEmail="ch••••@srmap.edu.in" codeAlreadySent onVerified={onVerified} onCancel={vi.fn()} />);
    expect(screen.getByText("ch••••@srmap.edu.in")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Verification code"), "12a3456");
    await waitFor(() => expect(onVerified).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/authentication\/2fa\/verify$/);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ code: "123456" });
  });

  it("shows the server's message on a wrong code and clears the input", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ message: "Incorrect code. 4 attempts left." }, 400));
    render(<TwoFactorChallenge maskedEmail="x" codeAlreadySent onVerified={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByLabelText("Verification code");
    await userEvent.type(input, "000000");
    expect(await screen.findByRole("alert")).toHaveTextContent("4 attempts left");
    expect(input).toHaveValue("");
  });

  it("returns to sign-in when the server says the sign-in expired", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ message: "Please sign in again." }, 401));
    const onCancel = vi.fn();
    render(<TwoFactorChallenge maskedEmail="x" codeAlreadySent onVerified={vi.fn()} onCancel={onCancel} />);
    await userEvent.type(screen.getByLabelText("Verification code"), "111111");
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
  });

  it("sends a code automatically when arriving without one (e.g. after Google sign-in)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ data: { maskedEmail: "ab••@x.in", codeSent: false } }))
      .mockResolvedValueOnce(json({ data: { maskedEmail: "ab••@x.in", resendInSeconds: 45 }, message: "Code sent" }));
    render(<TwoFactorChallenge onVerified={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(String(fetchSpy.mock.calls[1]![0])).toMatch(/2fa\/send$/);
    expect(await screen.findByText("ab••@x.in")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resend in/ })).toBeDisabled();
  });
});
