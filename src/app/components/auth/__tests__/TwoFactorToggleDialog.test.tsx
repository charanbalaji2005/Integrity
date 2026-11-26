import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TwoFactorToggleDialog } from "../TwoFactorToggleDialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("TwoFactorToggleDialog", () => {
  it("emails a code, then turns 2FA on with it", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ data: { maskedEmail: "st••@srmap.edu.in", resendInSeconds: 45 } }))
      .mockResolvedValueOnce(json({ data: { twoFactorEnabled: true } }));
    const onChanged = vi.fn();
    const onOpenChange = vi.fn();
    render(<TwoFactorToggleDialog open enable onOpenChange={onOpenChange} onChanged={onChanged} />);

    await userEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(await screen.findByText(/st••@srmap\.edu\.in/)).toBeInTheDocument();
    expect(JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body))).toEqual({ enabled: true });

    await userEvent.type(screen.getByLabelText("Verification code"), "654321");
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith({ twoFactorEnabled: true }));
    expect(JSON.parse(String((fetchSpy.mock.calls[1]![1] as RequestInit).body))).toEqual({ enabled: true, code: "654321" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the dialog open and shows the error on a wrong code", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ data: { maskedEmail: "x", resendInSeconds: 45 } }))
      .mockResolvedValueOnce(json({ message: "Incorrect code. 4 attempts left." }, 400));
    const onChanged = vi.fn();
    render(<TwoFactorToggleDialog open enable={false} onOpenChange={vi.fn()} onChanged={onChanged} />);
    expect(screen.getByText("Turn off two-step verification")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await userEvent.type(await screen.findByLabelText("Verification code"), "000000");
    expect(await screen.findByRole("alert")).toHaveTextContent("4 attempts left");
    expect(onChanged).not.toHaveBeenCalled();
  });
});
