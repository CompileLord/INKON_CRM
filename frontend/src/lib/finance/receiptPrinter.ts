export interface ReceiptPrintLine {
  label: string;
  value: string;
}

export interface ReceiptPrintContent {
  title: string;
  heading: string;
  lines: ReceiptPrintLine[];
  targetsHeading: string;
  targets: ReceiptPrintLine[];
  comment: string | null;
}

const PRINT_STYLES: string =
  "body{font-family:sans-serif;color:#000;margin:24px;max-width:520px}h1{font-size:20px;margin:0 0 16px}h2{font-size:15px;margin:20px 0 8px}dl,ul{margin:0;padding:0;list-style:none}dl div,li{display:flex;justify-content:space-between;gap:16px;padding:6px 0;border-bottom:1px solid #999}dt{font-weight:600}dd{margin:0;font-variant-numeric:tabular-nums}p{margin:12px 0 0}";

export class ReceiptPrinter {
  static print(content: ReceiptPrintContent): boolean {
    const printWindow: Window | null = window.open("", "_blank");
    if (printWindow === null) return false;
    const doc: Document = printWindow.document;
    doc.title = content.title;
    const style: HTMLStyleElement = doc.createElement("style");
    style.textContent = PRINT_STYLES;
    doc.head.appendChild(style);
    const heading: HTMLHeadingElement = doc.createElement("h1");
    heading.textContent = content.heading;
    const details: HTMLDListElement = doc.createElement("dl");
    for (const line of content.lines) details.appendChild(ReceiptPrinter.pair(doc, "div", "dt", "dd", line));
    doc.body.append(heading, details);
    if (content.targets.length > 0) {
      const targetsHeading: HTMLHeadingElement = doc.createElement("h2");
      targetsHeading.textContent = content.targetsHeading;
      const list: HTMLUListElement = doc.createElement("ul");
      for (const target of content.targets) list.appendChild(ReceiptPrinter.pair(doc, "li", "span", "span", target));
      doc.body.append(targetsHeading, list);
    }
    if (content.comment) {
      const comment: HTMLParagraphElement = doc.createElement("p");
      comment.textContent = content.comment;
      doc.body.appendChild(comment);
    }
    printWindow.focus();
    printWindow.print();
    return true;
  }

  private static pair(doc: Document, wrapperTag: string, labelTag: string, valueTag: string, line: ReceiptPrintLine): HTMLElement {
    const wrapper: HTMLElement = doc.createElement(wrapperTag);
    const label: HTMLElement = doc.createElement(labelTag);
    const value: HTMLElement = doc.createElement(valueTag);
    label.textContent = line.label;
    value.textContent = line.value;
    wrapper.append(label, value);
    return wrapper;
  }
}
