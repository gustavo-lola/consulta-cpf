
import puppeteer from "puppeteer";
import { readFileSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";

const CHUNK_SIZE = 1; 
const URL = "https://cadsinc.sefaz.al.gov.br/ConsultarDadosPessoaFisica.do";

async function ensureDirs(...dirs: string[]) {
  await Promise.all(dirs.map((d) => mkdir(d, { recursive: true })));
}

function readCPFs(): string[] {
  const conteudo = readFileSync("cpfs.txt", "utf-8");
  return conteudo
    .split(/\r?\n/)
    .map((cpf) => cpf.trim())
    .filter((cpf) => cpf.length > 0);
}

function safe(cpf: string) {
  return cpf.replace(/\D+/g, "");
}

async function processCPF(page: puppeteer.Page, cpf: string, outPDF: string, outPNG: string) {
  await page.goto(URL, { waitUntil: "networkidle2" });

  await page.type('input[name="numeroDocumento"]', cpf, { delay: 10 });

  await Promise.all([
    page.click('input[type="submit"]'),
    page.waitForNavigation({ waitUntil: "networkidle2" }),
  ]);

  await page.pdf({
    path: outPDF,
    format: "A4",
    printBackground: true,
  });

  await page.screenshot({
    path: outPNG,
    fullPage: true,
  });
}

async function main() {
  const cpfs = readCPFs();
  if (cpfs.length === 0) {
    console.error("cpfs.txt está vazio.");
    return;
  }

  const root = path.resolve("output");
  const pdfDir = path.join(root, "pdfs");
  const pngDir = path.join(root, "prints");
  await ensureDirs(root, pdfDir, pngDir);

  console.log(`Vão ser processados ${cpfs.length} CPFs...`);
  console.log(`Saída em:\n  PDFs : ${pdfDir}\n  Prints: ${pngDir}`);

  const browser = await puppeteer.launch({
    headless: true, 
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    for (let i = 0; i < cpfs.length; i += CHUNK_SIZE) {
      const chunk = cpfs.slice(i, i + CHUNK_SIZE);

      await Promise.all(
        chunk.map(async (cpf) => {
          const cpfSafe = safe(cpf);
          const outPDF = path.join(pdfDir, `resultado_${cpfSafe}.pdf`);
          const outPNG = path.join(pngDir, `resultado_${cpfSafe}.png`);

          const page = await browser.newPage();
          page.setDefaultNavigationTimeout(60_000);
          page.setDefaultTimeout(60_000);

          try {
            await processCPF(page, cpf, outPDF, outPNG);
            console.log(`OK: ${cpf} → PDF & print salvos.`);
          } catch (err) {
            console.error(`ERRO em ${cpf}:`, err);
          } finally {
            await page.close().catch(() => {});
          }
        })
      );
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error("Falha geral:", e);
  process.exit(1);
});
