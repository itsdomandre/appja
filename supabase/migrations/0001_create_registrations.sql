-- Migration: create registrations table and private "fotos" storage bucket
-- This is a data contract for the public registration form (sub-task 1).
-- No `idade` column: age is always computed at runtime from data_nascimento.

create extension if not exists pgcrypto;

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  data_nascimento date not null,
  ano_escolar text not null,
  localidade text not null,
  email text,
  instagram text,
  tiktok text,
  observacoes text,
  foto_path text not null,
  consentimento boolean not null,
  status text not null default 'pendente',
  created_at timestamptz not null default now(),
  constraint registrations_ano_escolar_check check (
    ano_escolar in (
      'Pré-escolar',
      '1º ano',
      '2º ano',
      '3º ano',
      '4º ano',
      '5º ano',
      '6º ano',
      '7º ano',
      '8º ano',
      '9º ano',
      '10º ano',
      '11º ano',
      '12º ano',
      'Ensino Superior — Licenciatura',
      'Ensino Superior — Mestrado',
      'Ensino Superior — Doutoramento',
      'Não estudante'
    )
  ),
  constraint registrations_consentimento_check check (consentimento = true),
  constraint registrations_status_check check (status in ('pendente', 'aprovado', 'rejeitado'))
);

-- Private storage bucket for uploaded photos. `public = false` means the
-- bucket is not publicly listable/readable; access must go through
-- signed URLs or authenticated requests.
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;
