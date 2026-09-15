"use client";

/**
 * Public registration form (used on /cadastro).
 *
 * STUB — renders a "not implemented" placeholder only. It intentionally does
 * NOT render the required inputs, the ano_escolar select, the localidade
 * input, or the consent checkbox/text yet, and has no submit behaviour.
 * Zero business logic. Owned by the implementer sub-task.
 */

export interface RegistrationFormProps {
  onSuccess?: () => void;
}

export default function RegistrationForm(_props: RegistrationFormProps) {
  return <div data-testid="registration-form-stub">Not implemented</div>;
}
