import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RegistrationForm from "./RegistrationForm";
import { ANO_ESCOLAR_OPTIONS } from "@/lib/validation/registration";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RegistrationForm", () => {
  it("AC22: renders all required-field inputs, the fixed ano_escolar select, and a free-text localidade input", () => {
    render(<RegistrationForm />);

    expect(screen.getByLabelText(/nome/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/telefone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/data de nascimento/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/foto/i)).toBeInTheDocument();

    const anoEscolarSelect = screen.getByLabelText(/ano escolar/i) as HTMLSelectElement;
    expect(anoEscolarSelect.tagName).toBe("SELECT");
    const optionValues = Array.from(anoEscolarSelect.options).map((option) => option.value);
    for (const option of ANO_ESCOLAR_OPTIONS) {
      expect(optionValues).toContain(option);
    }

    const localidadeInput = screen.getByLabelText(/localidade/i) as HTMLInputElement;
    expect(localidadeInput.tagName).toBe("INPUT");
    expect(localidadeInput.type).toBe("text");
  });

  it("AC27: renders the consent text and its checkbox, unchecked by default", () => {
    render(<RegistrationForm />);

    const consentCheckbox = screen.getByRole("checkbox", { name: /consent/i }) as HTMLInputElement;
    expect(consentCheckbox).not.toBeChecked();
    expect(screen.getByText(/consent/i)).toBeInTheDocument();
  });

  it("AC23: shows a success confirmation and resets the form after a successful submission", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ id: "11111111-1111-1111-1111-111111111111", status: "pendente" }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<RegistrationForm />);

    await user.type(screen.getByLabelText(/nome/i), "Maria Silva");
    await user.type(screen.getByLabelText(/telefone/i), "912345678");
    await user.type(screen.getByLabelText(/data de nascimento/i), "2005-04-12");
    await user.selectOptions(screen.getByLabelText(/ano escolar/i), "9º ano");
    await user.type(screen.getByLabelText(/localidade/i), "Lisboa");

    const fotoInput = screen.getByLabelText(/foto/i) as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" });
    await user.upload(fotoInput, file);

    await user.click(screen.getByRole("checkbox", { name: /consent/i }));
    await user.click(screen.getByRole("button", { name: /submeter|enviar|submit/i }));

    expect(await screen.findByText(/sucesso|success/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/nome/i) as HTMLInputElement).value).toBe("");

    fetchMock.mockRestore();
  });
});
