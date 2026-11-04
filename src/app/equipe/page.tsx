"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { FUNCOES_PADRAO, type Funcionario } from "@/lib/tipos";

type Formulario = {
  id: string | null; // null = funcionário novo
  nome: string;
  funcao: string;
  telefone: string;
};

const FORMULARIO_VAZIO: Formulario = { id: null, nome: "", funcao: "", telefone: "" };

export default function Equipe() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmarDesativar, setConfirmarDesativar] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!variaveisConfiguradas()) {
      setErro("O banco de dados não está configurado. Veja a página Início.");
      setCarregando(false);
      return;
    }
    const { data, error } = await supabase()
      .from("funcionarios")
      .select("id, nome, funcao, telefone, cpf, ativo")
      .order("nome");
    if (error) setErro(`Não foi possível carregar a equipe. ${error.message}`);
    else {
      setFuncionarios(data ?? []);
      setErro(null);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Funções que aparecem na lista: as padrão e as que já estão no banco.
  const funcoes = useMemo(() => {
    const todas = new Set([...FUNCOES_PADRAO, ...funcionarios.map((f) => f.funcao)]);
    return [...todas].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [funcionarios]);

  const ativos = funcionarios.filter((f) => f.ativo);
  const inativos = funcionarios.filter((f) => !f.ativo);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!formulario) return;
    const nome = formulario.nome.trim();
    const funcao = formulario.funcao.trim();
    const telefone = formulario.telefone.trim() || null;
    if (!nome || !funcao) {
      setErro("Preencha o nome e a função.");
      return;
    }
    setSalvando(true);
    const db = supabase().from("funcionarios");
    const { error } = formulario.id
      ? await db.update({ nome, funcao, telefone }).eq("id", formulario.id)
      : await db.insert({ nome, funcao, telefone });
    setSalvando(false);
    if (error) {
      setErro(`Não foi possível salvar. ${error.message}`);
      return;
    }
    setFormulario(null);
    await carregar();
  }

  async function mudarAtivo(id: string, ativo: boolean) {
    const { error } = await supabase().from("funcionarios").update({ ativo }).eq("id", id);
    if (error) {
      setErro(`Não foi possível atualizar. ${error.message}`);
      return;
    }
    setConfirmarDesativar(null);
    await carregar();
  }

  function editar(f: Funcionario) {
    setErro(null);
    setConfirmarDesativar(null);
    setFormulario({ id: f.id, nome: f.nome, funcao: f.funcao, telefone: f.telefone ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Equipe</h1>
        {!formulario && (
          <button
            className="botao"
            onClick={() => {
              setErro(null);
              setFormulario(FORMULARIO_VAZIO);
            }}
          >
            + Adicionar
          </button>
        )}
      </div>

      {erro && (
        <p className="cartao border-red-200 bg-red-50 text-red-800" role="alert">
          {erro}
        </p>
      )}

      {formulario && (
        <form onSubmit={salvar} className="cartao space-y-3">
          <h2 className="text-lg font-semibold">
            {formulario.id ? "Editar funcionário" : "Novo funcionário"}
          </h2>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Nome</span>
            <input
              className="campo"
              value={formulario.nome}
              onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
              autoComplete="off"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Função</span>
            <select
              className="campo"
              value={formulario.funcao}
              onChange={(e) => setFormulario({ ...formulario, funcao: e.target.value })}
              required
            >
              <option value="">Escolha a função</option>
              {funcoes.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Telefone</span>
            <input
              className="campo"
              type="tel"
              inputMode="tel"
              placeholder="(11) 90000-0000"
              value={formulario.telefone}
              onChange={(e) => setFormulario({ ...formulario, telefone: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              className="botao-secundario"
              onClick={() => setFormulario(null)}
              disabled={salvando}
            >
              Cancelar
            </button>
            <button type="submit" className="botao" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      )}

      {carregando ? (
        <p className="text-neutral-600">Carregando equipe...</p>
      ) : (
        <>
          <ul className="space-y-3">
            {ativos.map((f) => (
              <li key={f.id} className="cartao">
                <div className="text-lg font-semibold">{f.nome}</div>
                <div className="text-neutral-700">{f.funcao}</div>
                {f.telefone ? (
                  <a href={`tel:${f.telefone.replace(/\D/g, "")}`} className="text-neutral-700 underline">
                    {f.telefone}
                  </a>
                ) : (
                  <div className="text-neutral-400">Sem telefone</div>
                )}
                {confirmarDesativar === f.id ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm">
                      Desativar {f.nome}? Ele sai da lista e não aparece mais para escalar.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button className="botao-secundario" onClick={() => setConfirmarDesativar(null)}>
                        Voltar
                      </button>
                      <button
                        className="botao"
                        style={{ background: "#b91c1c" }}
                        onClick={() => mudarAtivo(f.id, false)}
                      >
                        Sim, desativar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className="botao-secundario" onClick={() => editar(f)}>
                      Editar
                    </button>
                    <button className="botao-secundario" onClick={() => setConfirmarDesativar(f.id)}>
                      Desativar
                    </button>
                  </div>
                )}
              </li>
            ))}
            {ativos.length === 0 && (
              <li className="cartao text-neutral-600">Nenhum funcionário ativo.</li>
            )}
          </ul>

          {inativos.length > 0 && (
            <section className="space-y-2 pt-2">
              <h2 className="text-lg font-semibold text-neutral-600">Desativados</h2>
              <ul className="space-y-2">
                {inativos.map((f) => (
                  <li key={f.id} className="cartao flex items-center justify-between gap-3 opacity-80">
                    <div>
                      <div className="font-semibold">{f.nome}</div>
                      <div className="text-sm text-neutral-600">{f.funcao}</div>
                    </div>
                    <button className="botao-secundario" onClick={() => mudarAtivo(f.id, true)}>
                      Reativar
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
