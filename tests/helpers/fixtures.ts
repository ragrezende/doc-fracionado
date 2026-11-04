import { PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { makeSyntheticPdf } from './syntheticPdf';

/** PDF mínimo, escrito à mão, com `/Encrypt` no trailer. Basta para ser detectado como protegido. */
export function encryptedMinimalPdf(): Uint8Array {
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] >>',
    '<< /Filter /Standard /V 1 /R 2 /O (xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx) /U (yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy) /P -4 >>',
  ];
  let texto = '%PDF-1.4\n';
  const deslocamentos: number[] = [];
  objetos.forEach((conteudo, i) => {
    deslocamentos.push(texto.length);
    texto += `${i + 1} 0 obj\n${conteudo}\nendobj\n`;
  });
  const xref = texto.length;
  texto += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  texto += deslocamentos.map((d) => `${String(d).padStart(10, '0')} 00000 n \n`).join('');
  texto += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Encrypt 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(texto);
}

async function pdfComCampoDeAssinatura(assinado: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 300]);
  const ctx = doc.context;
  const valorDaAssinatura = ctx.obj({
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: 'adbe.pkcs7.detached',
    ByteRange: [0, 0, 0, 0],
    Contents: PDFHexString.of('00'),
  });
  const campo = ctx.obj({
    Type: 'Annot',
    Subtype: 'Widget',
    FT: 'Sig',
    T: PDFString.of('Assinatura1'),
    Rect: [0, 0, 0, 0],
    ...(assinado ? { V: valorDaAssinatura } : {}),
  });
  const referenciaDoCampo = ctx.register(campo);
  doc.catalog.set(PDFName.of('AcroForm'), ctx.obj({ Fields: [referenciaDoCampo], SigFlags: assinado ? 3 : 0 }));
  return doc.save();
}

/** PDF cujo AcroForm tem `SigFlags 3` e um campo `FT /Sig` com valor (assinado). */
export function signedLikePdf(): Promise<Uint8Array> {
  return pdfComCampoDeAssinatura(true);
}

/** PDF com um campo de assinatura ainda em branco (sem `/V`, `SigFlags 0`). */
export function unsignedSignatureFieldPdf(): Promise<Uint8Array> {
  return pdfComCampoDeAssinatura(false);
}

/** 6 páginas de 1 MB; a página 1 tem um link interno com `/Dest` para a página 5. */
export async function pdfWithInternalLink(): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await makeSyntheticPdf({ pages: 6, bytesPerPage: 1_000_000 }));
  const ctx = doc.context;
  const alvo = doc.getPage(4).ref;
  const link = ctx.register(
    ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 50, 50], Border: [0, 0, 0], Dest: [alvo, 'Fit'] }),
  );
  doc.getPage(0).node.set(PDFName.of('Annots'), ctx.obj([link]));
  return doc.save();
}

/** 3 páginas de 400 x 300 cujo `MediaBox` existe só no nó `Pages`, herdado pelas páginas. */
export async function pdfWithInheritedMediaBox(): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await makeSyntheticPdf({ pages: 3, bytesPerPage: 1_000 }));
  for (const pagina of doc.getPages()) pagina.node.delete(PDFName.of('MediaBox'));
  doc.catalog.Pages().set(PDFName.of('MediaBox'), doc.context.obj([0, 0, 400, 300]));
  return doc.save();
}
