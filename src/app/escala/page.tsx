"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import type { Escala, Funcionario, Turno } from "@/lib/tipos";
import {
  diaMes,
  diasDaSemana,
  hojeISO,
  horaCurta,
  inicioDaSemana,
  rotuloDia,
  somarDias,
} from "@/lib/datas";

type Celula = { data: string; turno: Turno };

/** Chave única de uma célula da grade: "2026-11-20|id-do-turno" */
function chaveCelula(data: string, turnoId: string) {
  return `${data}|${turnoId}`;
}

export default function EscalaDaSemana() {
  const [segunda, setSegunda] = useState(() => inicioDaSemana(hojeISO()));
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [celulaAberta, setCelulaAberta] = useState<Celula | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const dias = useMemo(() => diasDaSemana(segunda), [segunda]);
  const domingo = dias[6];
  const hoje = hojeISO();

  // Turnos e funcionários: carregados uma vez.
  useEffect(() => {
    async function carregarBase() {
      if (!variaveisConfiguradas()) {
        setErro("O banco de dados não está configurado. Veja a página Início.");
        setCarregando(false);
        return;
      }
      const db = supabase();
      const [t, f] = await Promise.all([
        db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
        db.from("funcionarios").select("id, nome, funcao, telefone, cpf, ativo").order("nome"),
      ]);
      if (t.error || f.error) {
        setErro(`Não foi possível carregar os dados. ${(t.error ?? f.error)?.message}`);
        return;
      }
      setTurnos(t.data ?? []);
      setFuncionarios(f.data ?? []);
    }
    carregarBase();
  }, []);

  // Escala da semana: recarrega a cada troca de semana.
  const carregarSemana = useCallback(async () => {
    if (!variaveisConfiguradas()) return;
    setCarregando(true);
    const { data, error } = await supabase()
      .from("escalas")
      .select("id, data, turno_id, funcionario_id")
      .gte("data", segunda)
      .lte("data", domingo);
    if (error) setErro(`Não foi possível carregar a escala. ${error.message}`);
    else setEscalas(data ?? []);
    setCarregando(false);
  }, [segunda, domingo]);

  useEffect(() => {
    carregarSemana();
  }, [carregarSemana]);

  const funcionarioPorId = useMemo(
    () => new Map(funcionarios.map((f) => [f.id, f])),
    [funcionarios],
  );

  // Quem está escalado em cada célula.
  const porCelula = useMemo(() => {
    const mapa = new Map<string, Escala[]>();
    for (const e of escalas) {
      const chave = chaveCelula(e.data, e.turno_id);
      mapa.set(chave, [...(mapa.get(chave) ?? []), e]);
    }
    return mapa;
  }, [escalas]);

  function nomesNaCelula(data: string, turnoId: string): Funcionario[] {
    return (porCelula.get(chaveCelula(data, turnoId)) ?? [])
      .map((e) => funcionarioPorId.get(e.funcionario_id))
      .filter((f): f is Funcionario => Boolean(f))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  async function alternar(funcionario: Funcionario) {
    if (!celulaAberta) return;
    const { data, turno } = celulaAberta;
    const existente = escalas.find(
      (e) => e.data === data && e.turno_id === turno.id && e.funcionario_id === funcionario.id,
    );
    setSalvandoId(funcionario.id);
    setErro(null);
    if (existente) {
      const { error } = await supabase().from("escalas").delete().eq("id", existente.id);
      if (error) setErro(`Não foi possível remover. ${error.message}`);
      else setEscalas((atual) => atual.filter((e) => e.id !== existente.id));
    } else {
      const { data: nova, error } = await supabase()
        .from("escalas")
        .insert({ data, turno_id: turno.id, funcionario_id: funcionario.id })
        .select("id, data, turno_id, funcionario_id")
        .single();
      if (error) setErro(`Não foi possível escalar. ${error.message}`);
      else if (nova) setEscalas((atual) => [...atual, nova]);
    }
    setSalvandoId(null);
  }

  // Lista mostrada ao abrir uma célula: funcionários ativos, agrupados por função,
  // mais qualquer desativado que ainda esteja escalado ali (para poder tirar).
  const gruposDaCelula = useMemo(() => {
    if (!celulaAberta) return [];
    const escaladosIds = new Set(
      (porCelula.get(chaveCelula(celulaAberta.data, celulaAberta.turno.id)) ?? []).map(
        (e) => e.funcionario_id,
      ),
    );
    const lista = funcionarios.filter((f) => f.ativo || escaladosIds.has(f.id));
    const grupos = new Map<string, Funcionario[]>();
    for (const f of lista) grupos.set(f.funcao, [...(grupos.get(f.funcao) ?? []), f]);
    return [...grupos.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([funcao, pessoas]) => ({ funcao, pessoas, escaladosIds }));
  }, [celulaAberta, funcionarios, porCelula]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Escala da semana</h1>

      <div className="cartao flex items-center justify-between gap-2 p-2">
        <button
          className="botao-secundario px-3"
          onClick={() => setSegunda(somarDias(segunda, -7))}
          aria-label="Semana anterior"
        >
          ← Anterior
        </button>
        <div className="text-center leading-tight">
          <div className="text-xs text-neutral-500">Semana</div>
          <div className="font-semibold">
            {diaMes(segunda)} a {diaMes(domingo)}
          </div>
        </div>
        <button
          className="botao-secundario px-3"
          onClick={() => setSegunda(somarDias(segunda, 7))}
          aria-label="Próxima semana"
        >
          Próxima →
        </button>
      </div>

      {erro && (
        <p className="cartao border-red-200 bg-red-50 text-red-800" role="alert">
          {erro}
        </p>
      )}

      <p className="text-sm text-neutral-600">
        Toque em um quadro para escolher quem trabalha. Arraste para o lado para ver todos os dias.
      </p>

      <div
        className={`cartao overflow-x-auto p-0 transition-opacity ${carregando ? "opacity-50" : ""}`}
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] min-w-24 border-b border-neutral-200 bg-white p-2 text-left">
                Turno
              </th>
              {dias.map((dia) => (
                <th
                  key={dia}
                  className={`min-w-28 border-b border-l border-neutral-200 p-2 text-center ${
                    dia === hoje ? "bg-secundaria" : ""
                  }`}
                >
                  {rotuloDia(dia)}
                  {dia === hoje && <div className="text-xs font-normal">hoje</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {turnos.map((turno) => (
              <tr key={turno.id}>
                <th className="sticky left-0 z-[1] border-b border-neutral-200 bg-white p-2 text-left align-top">
                  <div className="font-semibold">{turno.nome}</div>
                  <div className="text-xs font-normal text-neutral-500">
                    {horaCurta(turno.hora_inicio)}–{horaCurta(turno.hora_fim)}
                  </div>
                </th>
                {dias.map((dia) => {
                  const pessoas = nomesNaCelula(dia, turno.id);
                  return (
                    <td key={dia} className="border-b border-l border-neutral-200 p-1 align-top">
                      <button
                        className="flex min-h-28 w-full flex-col items-stretch gap-1 rounded-lg p-1.5 text-left active:bg-neutral-100"
                        onClick={() => setCelulaAberta({ data: dia, turno })}
                        aria-label={`${turno.nome} de ${rotuloDia(dia)}: ${pessoas.length} pessoas`}
                      >
                        {pessoas.length === 0 ? (
                          <span className="m-auto text-2xl text-neutral-300">+</span>
                        ) : (
                          <>
                            <span className="text-xs font-semibold text-neutral-500">
                              {pessoas.length} {pessoas.length === 1 ? "pessoa" : "pessoas"}
                            </span>
                            {pessoas.map((p) => (
                              <span
                                key={p.id}
                                className="truncate rounded-md px-1.5 py-0.5 text-xs font-medium text-white"
                                style={{ background: "var(--cor-principal)" }}
                              >
                                {p.nome.split(" ")[0]}
                              </span>
                            ))}
                          </>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {turnos.length === 0 && !carregando && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-neutral-600">
                  Nenhum turno cadastrado no banco.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {celulaAberta && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setCelulaAberta(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="border-b border-neutral-200 p-4">
              <div className="text-lg font-bold">
                {celulaAberta.turno.nome} · {rotuloDia(celulaAberta.data)}
              </div>
              <div className="text-sm text-neutral-600">
                Toque nos nomes para marcar ou desmarcar. Salva na hora.
              </div>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {gruposDaCelula.map(({ funcao, pessoas, escaladosIds }) => (
                <div key={funcao}>
                  <div className="mb-1 text-sm font-semibold text-neutral-500">{funcao}</div>
                  <div className="space-y-2">
                    {pessoas.map((p) => {
                      const marcado = escaladosIds.has(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => alternar(p)}
                          disabled={salvandoId !== null}
                          className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-base ${
                            marcado ? "border-transparent text-white" : "border-neutral-300 bg-white"
                          } ${salvandoId === p.id ? "opacity-60" : ""}`}
                          style={marcado ? { background: "var(--cor-principal)" } : undefined}
                          aria-pressed={marcado}
                        >
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold ${
                              marcado ? "border-white" : "border-neutral-400"
                            }`}
                          >
                            {marcado ? "✓" : ""}
                          </span>
                          <span className="flex-1 font-medium">{p.nome}</span>
                          {!p.ativo && <span className="text-xs">desativado</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {gruposDaCelula.length === 0 && (
                <p className="text-neutral-600">Nenhum funcionário ativo. Cadastre na tela Equipe.</p>
              )}
            </div>
            <div className="border-t border-neutral-200 p-4">
              <button className="botao w-full" onClick={() => setCelulaAberta(null)}>
                Pronto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
