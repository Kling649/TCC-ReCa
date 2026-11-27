// Adaptador local que imita a API do D1 (prepare / bind / first / all / run / batch)
// usando o SQLite embutido do Node 22 (node:sqlite). Serve só para testes e para o
// servidor de desenvolvimento local (npm run dev:local). Em produção o Worker usa o D1 real.

import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function normalizar(valores) {
  return valores.map((v) => {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  });
}

class Comando {
  constructor(banco, sql, valores = []) {
    this.banco = banco;
    this.sql = sql;
    this.valores = valores;
  }

  bind(...valores) {
    return new Comando(this.banco, this.sql, valores);
  }

  first(coluna) {
    const linha = this.banco.prepare(this.sql).get(...normalizar(this.valores));
    if (!linha) return null;
    return coluna ? linha[coluna] ?? null : linha;
  }

  all() {
    const linhas = this.banco.prepare(this.sql).all(...normalizar(this.valores));
    return { results: [...linhas], success: true, meta: {} };
  }

  run() {
    const info = this.banco.prepare(this.sql).run(...normalizar(this.valores));
    return {
      success: true,
      results: [],
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
    };
  }

  /** Executa conforme o tipo de comando (consulta ou escrita). */
  executar() {
    return /^\s*(select|with)\b/i.test(this.sql) ? this.all() : this.run();
  }
}

/**
 * Cria um banco "D1" local. `caminho` pode ser ':memory:' ou um arquivo.
 * Chaves estrangeiras ficam ativas, como no D1.
 */
export function criarD1Local(caminho = ':memory:') {
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
  const banco = new DatabaseSync(caminho);
  banco.exec('PRAGMA foreign_keys = ON;');

  return {
    _banco: banco,
    prepare(sql) {
      return new Comando(banco, sql);
    },
    async batch(comandos) {
      banco.exec('BEGIN');
      try {
        const resultados = comandos.map((c) => c.executar());
        banco.exec('COMMIT');
        return resultados;
      } catch (erro) {
        banco.exec('ROLLBACK');
        throw erro;
      }
    },
    async exec(sql) {
      banco.exec(sql);
    },
  };
}

/** Aplica, em ordem, todos os arquivos de migrations/ que ainda não foram aplicados. */
export function aplicarMigrations(d1, pasta = join(RAIZ, 'migrations')) {
  d1._banco.exec(
    'CREATE TABLE IF NOT EXISTS _migracoes_locais (nome TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL);',
  );
  const jaAplicadas = new Set(
    d1._banco.prepare('SELECT nome FROM _migracoes_locais').all().map((r) => r.nome),
  );
  const arquivos = readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort();
  for (const arquivo of arquivos) {
    if (jaAplicadas.has(arquivo)) continue;
    d1._banco.exec('BEGIN');
    try {
      d1._banco.exec(readFileSync(join(pasta, arquivo), 'utf8'));
      d1._banco.prepare('INSERT INTO _migracoes_locais (nome, aplicada_em) VALUES (?, ?)')
        .run(arquivo, new Date().toISOString());
      d1._banco.exec('COMMIT');
    } catch (erro) {
      d1._banco.exec('ROLLBACK');
      throw new Error(`Falha ao aplicar ${arquivo}: ${erro.message}`);
    }
  }
  return arquivos;
}
