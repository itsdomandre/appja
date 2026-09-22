import RegistrationForm from "@/components/RegistrationForm";

export default function CadastroPage() {
  return (
    <main>
      <h1>Cadastro JA - IASD Amadora</h1>
      <p className="mb-6 text-sm text-gray-600">
        Bem-vindo(a)! Preencha o formulário abaixo para se cadastrar no clube de Jovens
        Adventistas (JA) da IASD Amadora.
      </p>
      <RegistrationForm />
    </main>
  );
}
