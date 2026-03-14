import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';
import type { Order, OrderStatus } from '@/types';
import { ORDER_STATUS_LABELS } from '@/types';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

// --- Shared status helpers ---

const STATUS_COLORS: Record<OrderStatus, { r: number; g: number; b: number; hex: string }> = {
  uncommented: { r: 156, g: 163, b: 175, hex: '9CA3AF' },
  commented: { r: 250, g: 204, b: 21, hex: 'FACC15' },
  comment_revealed: { r: 96, g: 165, b: 250, hex: '60A5FA' },
  reimbursed: { r: 74, g: 222, b: 128, hex: '4ADE80' },
};

/** Maps a status to an Excel fill category for conditional coloring. */
function statusFillCategory(status: OrderStatus): 'green' | 'yellow' | 'blue' | 'gray' {
  switch (status) {
    case 'reimbursed':
      return 'green';
    case 'commented':
      return 'yellow';
    case 'comment_revealed':
      return 'blue';
    case 'uncommented':
      return 'gray';
  }
}

const STATUS_FILL_COLORS: Record<string, string> = {
  green: '4ADE80',
  yellow: 'FACC15',
  blue: '60A5FA',
  gray: '9CA3AF',
};

const STATUS_FONT_COLORS: Record<string, string> = {
  green: 'FFFFFF',
  yellow: '000000',
  blue: 'FFFFFF',
  gray: 'FFFFFF',
};

function readableStatus(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

function parsePrice(price: string): number {
  const match = price.replace(/[^0-9.]/g, '');
  return Number.parseFloat(match) || 0;
}

function buildSummary(orders: Order[]) {
  const statusCounts: Record<string, number> = {};
  let totalValue = 0;

  for (const order of orders) {
    const label = readableStatus(order.status);
    statusCounts[label] = (statusCounts[label] || 0) + 1;
    totalValue += parsePrice(order.price);
  }

  return { total: orders.length, statusCounts, totalValue };
}

function orderRow(order: Order) {
  return {
    'Order Number': order.orderNumber,
    'Product Name': order.productName,
    'Order Date': order.orderDate,
    Price: order.price,
    Status: readableStatus(order.status),
    Note: order.note ?? '',
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function dateSuffix(): string {
  return new Date().toISOString().split('T')[0];
}

// --- CSV ---

export function exportOrdersToCSV(orders: Order[]): void {
  const rows = orders.map(orderRow);
  const summary = buildSummary(orders);

  const summaryRows = [
    {},
    { 'Order Number': '--- Summary ---' },
    { 'Order Number': 'Total Orders', 'Product Name': String(summary.total) },
    {
      'Order Number': 'Total Spent',
      'Product Name': `$${summary.totalValue.toFixed(2)}`,
    },
    {},
    { 'Order Number': '--- By Status ---' },
    ...Object.entries(summary.statusCounts).map(([label, count]) => ({
      'Order Number': label,
      'Product Name': String(count),
    })),
  ];

  const csv = Papa.unparse([...rows, ...summaryRows]);
  downloadBlob(new Blob([csv], { type: 'text/csv' }), `amazon-orders-${dateSuffix()}.csv`);
}

// --- Excel (exceljs) ---

async function exportOrdersToXLSX(orders: Order[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Orders');

  // Define columns
  const columns = [
    { header: 'Order Number', key: 'orderNumber', width: 22 },
    { header: 'Product Name', key: 'productName', width: 44 },
    { header: 'Order Date', key: 'orderDate', width: 18 },
    { header: 'Price', key: 'price', width: 14 },
    { header: 'Status', key: 'status', width: 20 },
    { header: 'Note', key: 'note', width: 32 },
  ];
  sheet.columns = columns;

  // Style header row: bold, white text on purple background
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF7C3AED' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  // Freeze first row
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 0, activeCell: 'A2' }];

  // Auto-filter on all columns
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  // Add data rows
  for (const order of orders) {
    const row = sheet.addRow({
      orderNumber: order.orderNumber,
      productName: order.productName,
      orderDate: order.orderDate,
      price: order.price,
      status: readableStatus(order.status),
      note: order.note ?? '',
    });

    // Color-code the status cell
    const category = statusFillCategory(order.status);
    const statusCell = row.getCell('status');
    statusCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${STATUS_FILL_COLORS[category]}` },
    };
    statusCell.font = {
      color: { argb: `FF${STATUS_FONT_COLORS[category]}` },
      bold: true,
    };
    statusCell.alignment = { horizontal: 'center' };

    // Format price cell
    const priceCell = row.getCell('price');
    const numericPrice = parsePrice(order.price);
    if (numericPrice > 0) {
      priceCell.value = numericPrice;
      priceCell.numFmt = '$#,##0.00';
    }
  }

  // Summary section below data
  const summary = buildSummary(orders);
  const gapRow = orders.length + 3; // +1 header, +1 data end, +1 blank

  const summaryTitleRow = sheet.getRow(gapRow);
  summaryTitleRow.getCell(1).value = 'Summary';
  summaryTitleRow.getCell(1).font = { bold: true, size: 13 };

  const totalOrdersRow = sheet.getRow(gapRow + 1);
  totalOrdersRow.getCell(1).value = 'Total Orders';
  totalOrdersRow.getCell(1).font = { bold: true };
  totalOrdersRow.getCell(2).value = summary.total;

  const totalSpentRow = sheet.getRow(gapRow + 2);
  totalSpentRow.getCell(1).value = 'Total Spent';
  totalSpentRow.getCell(1).font = { bold: true };
  totalSpentRow.getCell(2).value = summary.totalValue;
  totalSpentRow.getCell(2).numFmt = '$#,##0.00';

  let statusRow = gapRow + 4;
  const statusHeader = sheet.getRow(statusRow - 1);
  statusHeader.getCell(1).value = 'Orders by Status';
  statusHeader.getCell(1).font = { bold: true, size: 11 };

  for (const [label, count] of Object.entries(summary.statusCounts)) {
    const r = sheet.getRow(statusRow);
    r.getCell(1).value = label;
    r.getCell(2).value = count;
    statusRow++;
  }

  // Write to buffer and download
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `amazon-orders-${dateSuffix()}.xlsx`,
  );
}

// --- PDF ---

function exportOrdersToPDF(orders: Order[]): void {
  const doc = new jsPDF({ orientation: 'landscape' });
  const summary = buildSummary(orders);
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(18);
  doc.text('Amazon Orders Report', 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100);

  // Date range from orders
  const dates = orders
    .map((o) => o.orderDate)
    .filter(Boolean)
    .sort();
  const dateRange =
    dates.length > 1 ? `${dates[0]} — ${dates[dates.length - 1]}` : (dates[0] ?? 'N/A');
  doc.text(`Date Range: ${dateRange}`, 14, 27);

  const generated = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(`Generated: ${generated}`, pageWidth - 14, 27, { align: 'right' });
  doc.setTextColor(0);

  // Orders table
  const rows = orders.map((o) => [
    o.orderNumber,
    o.productName,
    o.orderDate,
    o.price,
    readableStatus(o.status),
    o.note ?? '',
  ]);

  autoTable(doc, {
    startY: 33,
    head: [['Order #', 'Product', 'Date', 'Price', 'Status', 'Note']],
    body: rows,
    headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 80 },
      4: { cellWidth: 28 },
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 4) {
        const status = orders[data.row.index]?.status;
        if (status) {
          const c = STATUS_COLORS[status];
          data.cell.styles.fillColor = [c.r, c.g, c.b];
          data.cell.styles.textColor =
            status === 'commented' ? [0, 0, 0] : [255, 255, 255];
        }
      }
    },
  });

  // Summary section with status table
  const finalY =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', 14, finalY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Total Orders: ${summary.total}`, 14, finalY + 7);
  doc.text(`Total Spent: $${summary.totalValue.toFixed(2)}`, 14, finalY + 13);

  // Status breakdown as a proper table with color indicators
  const statusEntries = Object.entries(summary.statusCounts);
  const statusTableBody = statusEntries.map(([label, count]) => [label, String(count)]);

  // Find the matching OrderStatus for each label to get colors
  const labelToStatus = new Map<string, OrderStatus>();
  for (const [status, label] of Object.entries(ORDER_STATUS_LABELS)) {
    labelToStatus.set(label, status as OrderStatus);
  }

  autoTable(doc, {
    startY: finalY + 18,
    head: [['Status', 'Count']],
    body: statusTableBody,
    headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 3 },
    tableWidth: 90,
    margin: { left: 14 },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 30, halign: 'center' },
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 0) {
        const label = statusTableBody[data.row.index]?.[0];
        if (label) {
          const status = labelToStatus.get(label);
          if (status) {
            const c = STATUS_COLORS[status];
            data.cell.styles.fillColor = [c.r, c.g, c.b];
            data.cell.styles.textColor =
              status === 'commented' ? [0, 0, 0] : [255, 255, 255];
          }
        }
      }
    },
  });

  // Page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() - 30,
      doc.internal.pageSize.getHeight() - 10,
    );
  }

  doc.save(`amazon-orders-${dateSuffix()}.pdf`);
}

// --- Dispatcher ---

export function exportOrders(orders: Order[], format: ExportFormat): void {
  switch (format) {
    case 'csv':
      exportOrdersToCSV(orders);
      break;
    case 'xlsx':
      exportOrdersToXLSX(orders);
      break;
    case 'pdf':
      exportOrdersToPDF(orders);
      break;
  }
}
