import Link from "next/link";

export default function CadastroSucessoPage() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-10 w-10 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h1 className="mb-2 text-2xl font-semibold text-gray-900">Cadastro enviado com sucesso!</h1>
      <p className="mb-6 text-sm text-gray-600">
        Obrigado por se cadastrar. Em breve entraremos em contacto.
      </p>
      <p className="font-medium text-gray-800">Equipa JA | IASD AMADORA</p>

      <Link
        href="/cadastro"
        className="mt-8 text-sm font-medium text-gray-600 hover:text-gray-900 hover:underline"
      >
        ← Voltar ao formulário
      </Link>
    </main>
  );
}
