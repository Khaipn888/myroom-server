const invoiceService = require("../services/invoice.service");
const AppError = require("../utils/AppError");
const ResponseFormatter = require("../utils/ResponseFormatter");
const BaseController = require("../utils/BaseController");
const ExcelJS = require("exceljs");
const path = require("path");

exports.create = (req, res) =>
  BaseController.handle(req, res, async () => {
    const { roomId, hostelId, price, year, month, water, elec, services, totalMembers, images } =
      req.body;

    // Kiểm tra bắt buộc
    if (!roomId || !price || !year || !month || !water || !elec) {
      throw new AppError("Thiếu thông tin bắt buộc: roomId, year, month, water, elec", 400);
    }

    const invoice = await invoiceService.createInvoice({
      roomId,
      hostelId,
      price,
      year,
      month,
      water,
      elec,
      services,
      totalMembers: totalMembers || 1,
      images,
    });

    res.status(201).json(ResponseFormatter.success(invoice, "Tạo Invoice thành công"));
  });

exports.getByMonth = (req, res) =>
  BaseController.handle(req, res, async () => {
    const { roomId, year: y, month: m } = req.query;

    // Validate param
    if (!roomId) {
      throw new AppError("roomId (ObjectId) là bắt buộc", 400);
    }
    if (!y || isNaN(Number(y))) {
      throw new AppError("year (năm) là bắt buộc và phải là số", 400);
    }
    if (!m || isNaN(Number(m))) {
      throw new AppError("month (tháng) là bắt buộc và phải là số 1-12", 400);
    }

    const year = Number(y);
    const month = Number(m);

    const invoiceOrTemplate = await invoiceService.getInvoiceByMonth({
      roomId,
      year,
      month,
    });

    res.json(
      ResponseFormatter.success(invoiceOrTemplate, "Lấy thông tin Invoice theo tháng thành công")
    );
  });

exports.getAllOfRoom = (req, res) =>
  BaseController.handle(req, res, async () => {
    const roomId = req.params.roomId;
    if (!roomId) {
      throw new AppError("roomId là bắt buộc", 400);
    }

    const invoices = await invoiceService.getAllInvoicesOfRoom(roomId);
    return res.json(ResponseFormatter.success(invoices, "Lấy tất cả hóa đơn của phòng thành công"));
  });

exports.updateStatus = (req, res) =>
  BaseController.handle(req, res, async () => {
    const invoiceId = req.params.id;
    const { status } = req.body;

    if (!invoiceId) {
      throw new AppError("invoiceId là bắt buộc", 400);
    }
    if (!status) {
      throw new AppError("status là bắt buộc", 400);
    }

    const updated = await invoiceService.updateInvoiceStatus(invoiceId, status);
    return res.json(ResponseFormatter.success(updated, "Cập nhật trạng thái hóa đơn thành công"));
  });

exports.exportMultipleTables = (req, res) =>
  BaseController.handle(req, res, async () => {
    const userId = req.user.id;

    // 1. Lấy tùy chọn month/year (nếu có)
    const monthParam = req.query.month;
    const yearParam = req.query.year;
    let month, year;
    if (monthParam !== undefined && yearParam !== undefined) {
      month = parseInt(monthParam, 10);
      year = parseInt(yearParam, 10);
      if (isNaN(month) || month < 1 || month > 12) {
        throw new AppError("Tháng (month) phải là số 1–12", 400);
      }
      if (isNaN(year) || year < 2000) {
        throw new AppError("Năm (year) không hợp lệ", 400);
      }
    }

    // 2. Lấy danh sách hostels của user
    const hostels = await invoiceService.getAllHostels(userId);

    // 3. Tạo Workbook mới
    const workbook = new ExcelJS.Workbook();

    // 4. Load template từ file Template.xlsx
    const templatePath = path.resolve(__dirname, "../templates/Template.xlsx");
    const templateWB = new ExcelJS.Workbook();
    await templateWB.xlsx.readFile(templatePath);
    const templateWS = templateWB.getWorksheet(1);

    // Xác định các vùng merge header cột (rows 3–4) trong template
    const HEADER_COT_START_ROW = 3;
    const HEADER_COT_NUM_ROWS = 2; // rows 3 & 4
    const headerMergeRanges = [];
    if (typeof templateWS._merges === "object") {
      for (const range of Object.values(templateWS._merges)) {
        const { top, left, bottom, right } = range.model;
        if (
          top >= HEADER_COT_START_ROW &&
          bottom <= HEADER_COT_START_ROW + HEADER_COT_NUM_ROWS - 1
        ) {
          headerMergeRanges.push({ top, left, bottom, right });
        }
      }
    }

    for (const hostel of hostels) {
      // Tạo sheet với tên an toàn (≤31 ký tự, không chứa ký tự đặc biệt)
      let safeName = hostel.name || "Hostel";
      if (safeName.length > 31) safeName = safeName.substring(0, 31);
      safeName = safeName.replace(/[\[\]\:\*\?\/\\]/g, "_");
      const sheet = workbook.addWorksheet(safeName);

      //
      // A. Nhóm hóa đơn theo tháng và xác định dịch vụ ngoài điện/nước
      //
      const invoices = await invoiceService.getInvoicesByHostel({
        hostelId: hostel._id.toString(),
        month,
        year,
      });
      const groupByMonth = {};
      invoices.forEach((inv) => {
        const key = `${inv.year}-${String(inv.month).padStart(2, "0")}`;
        if (!groupByMonth[key]) groupByMonth[key] = [];
        groupByMonth[key].push(inv);
      });

      // Lấy danh sách dịch vụ ngoài điện/nước để xây header động
      const serviceMap = {};
      invoices.forEach((inv) => {
        if (Array.isArray(inv.services)) {
          inv.services.forEach((s) => {
            const lower = s.name.trim().toLowerCase();
            if (lower.includes("điện") || lower.includes("nước")) return;
            serviceMap[s.name.trim()] = s.unit;
          });
        }
      });
      const otherServices = Object.keys(serviceMap).map((nm) => ({
        name: nm,
        unit: serviceMap[nm],
      }));
      const S = otherServices.length;

      // Số cột cuối cùng: 11 cố định (A–K) + S + 2 (Tổng cộng, Tình trạng)
      const totalCols = 11 + S + 2;

      //
      // B. Vẽ từng sub‐table (mỗi tháng) trong sheet
      //
      let currentRow = 1;
      const sortedKeys = Object.keys(groupByMonth).sort();

      for (const monthKey of sortedKeys) {
        const [yStr, mStr] = monthKey.split("-");
        const invsOfThisMonth = groupByMonth[monthKey];

        //
        // 1) Title (merge 2 dòng và tô màu nền)
        //
        try {
          sheet.mergeCells(currentRow, 1, currentRow + 1, totalCols);
        } catch {}
        const titleCell = sheet.getRow(currentRow).getCell(1);
        titleCell.value = `Hóa đơn tiền trọ tháng ${mStr}/${yStr} – ${hostel.name}`;
        titleCell.font = { bold: true, size: 12 };
        titleCell.alignment = { horizontal: "center", vertical: "middle" };
        // Tô màu nền cho toàn dòng title (màu xanh nhạt)
        for (let r = currentRow; r <= currentRow + 1; r++) {
          const row = sheet.getRow(r);
          for (let c = 1; c <= totalCols; c++) {
            row.getCell(c).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFCCFFFF" },
            };
          }
        }

        // Sau khi tạo title 2 dòng, move currentRow xuống hàng header cột
        currentRow += 2;

        //
        // 2) Merge header cột (rows 3–4 của template) tại vị trí currentRow
        //
        headerMergeRanges.forEach(({ top, left, bottom, right }) => {
          const newTop = currentRow + (top - HEADER_COT_START_ROW);
          const newBottom = currentRow + (bottom - HEADER_COT_START_ROW);
          try {
            sheet.mergeCells(newTop, left, newBottom, right);
          } catch {}
        });

        //
        // 3) Copy giá trị + font + alignment (bỏ border/fill) của header cột
        //    Đồng thời tô màu nền cho header (màu vàng nhạt),
        //    ghi đè đơn giá Điện & Nước, ghi đơn giá dịch vụ ngoài vào header row 4
        //
        for (let rOff = 0; rOff < HEADER_COT_NUM_ROWS; rOff++) {
          const srcRowIndex = HEADER_COT_START_ROW + rOff; // 3 hoặc 4
          const dstRowIndex = currentRow + rOff;
          const srcRow = templateWS.getRow(srcRowIndex);
          const dstRow = sheet.getRow(dstRowIndex);
          dstRow.height = srcRow.height;

          // Tô màu nền cho header cột (màu vàng nhạt)
          for (let c = 1; c <= totalCols; c++) {
            dstRow.getCell(c).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFF0B2" },
            };
          }

          srcRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            // Copy cột A–K (1–11), ngoại trừ cột đơn giá Điện (9),
            // đơn giá Nước (10), và đơn giá dịch vụ ngoài ở header row 4 (rOff===1)
            if (colNumber <= 11) {
              if (rOff === 1 && (colNumber === 9 || colNumber === 10)) {
                return;
              }
              const newCell = dstRow.getCell(colNumber);
              newCell.value = cell.value;
              if (cell.font) newCell.font = { ...cell.font };
              if (cell.alignment) newCell.alignment = { ...cell.alignment };
              if (cell.numFmt) newCell.numFmt = cell.numFmt;
            }
          });

          // Ghi đè đơn giá Điện & Nước khi rOff === 1 (header row 4)
          if (rOff === 1) {
            // Lấy giá và đơn vị từ một hóa đơn bất kỳ trong invsOfThisMonth
            let elecServ = null;
            let waterServ = null;
            if (Array.isArray(invsOfThisMonth[0]?.services)) {
              elecServ = invsOfThisMonth[0].services.find((x) =>
                x.name.toLowerCase().includes("điện")
              );
              waterServ = invsOfThisMonth[0].services.find((x) =>
                x.name.toLowerCase().includes("nước")
              );
            }
            // Cột 9: đơn giá Điện
            const cElec = dstRow.getCell(9);
            if (elecServ) {
              cElec.value = `${elecServ.price}${elecServ.unit}`;
            }
            cElec.alignment = { horizontal: "center", vertical: "middle" };

            // Cột 10: đơn giá Nước
            const cWater = dstRow.getCell(10);
            if (waterServ) {
              cWater.value = `${waterServ.price}${waterServ.unit}`;
            }
            cWater.alignment = { horizontal: "center", vertical: "middle" };
          }

          // Chèn header dịch vụ ngoài (rOff===0 ghi tên, rOff===1 ghi đơn giá)
          if (rOff === 0) {
            // Dòng đầu của header cột (tên dịch vụ)
            otherServices.forEach((srv, idx) => {
              const c = dstRow.getCell(12 + idx);
              c.value = srv.name;
              c.font = { bold: true };
              c.alignment = { horizontal: "center", vertical: "middle" };
            });
          } else {
            // Dòng thứ hai của header cột (đơn giá dịch vụ)
            otherServices.forEach((srv, idx) => {
              const cellIndex = 12 + idx;
              // Tìm trong invsOfThisMonth[0].services để lấy price+unit
              let svcObj = null;
              if (Array.isArray(invsOfThisMonth[0]?.services)) {
                svcObj = invsOfThisMonth[0].services.find((x) => x.name.trim() === srv.name);
              }
              const c = dstRow.getCell(cellIndex);
              if (svcObj) {
                c.value = `${svcObj.price}${svcObj.unit}`;
              }
              c.alignment = { horizontal: "center", vertical: "middle" };
            });
          }
        }

        //
        // 4) Merge & ghi “TỔNG CỘNG” và “TÌNH TRẠNG”
        //    Đồng thời tô màu nền cho ô “Tổng cộng” & “Tình trạng” giống header
        //
        const headerStart = currentRow;
        const colTotal = 12 + S;
        const colStatus = 13 + S;
        try {
          sheet.mergeCells(headerStart, colTotal, headerStart + 1, colTotal);
        } catch {}
        const totalHdrCell = sheet.getRow(headerStart).getCell(colTotal);
        totalHdrCell.value = "TỔNG CỘNG";
        totalHdrCell.font = { bold: true };
        totalHdrCell.alignment = { horizontal: "center", vertical: "middle" };
        // Tô màu nền cho ô “Tổng cộng”
        for (let r = headerStart; r <= headerStart + 1; r++) {
          sheet.getRow(r).getCell(colTotal).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFF0B2" },
          };
        }

        try {
          sheet.mergeCells(headerStart, colStatus, headerStart + 1, colStatus);
        } catch {}
        const statusHdrCell = sheet.getRow(headerStart).getCell(colStatus);
        statusHdrCell.value = "TÌNH TRẠNG";
        statusHdrCell.font = { bold: true };
        statusHdrCell.alignment = { horizontal: "center", vertical: "middle" };
        // Tô màu nền cho ô “Tình trạng”
        for (let r = headerStart; r <= headerStart + 1; r++) {
          sheet.getRow(r).getCell(colStatus).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFF0B2" },
          };
        }

        //
        // 5) Chèn dữ liệu bắt đầu từ hàng currentRow + 2
        //    và tô nền cho mỗi dòng dữ liệu (màu xám nhạt)
        //
        const dataStartRow = currentRow + HEADER_COT_NUM_ROWS; // +2
        let dataRowIndex = dataStartRow;

        invsOfThisMonth.forEach((inv) => {
          const row = sheet.getRow(dataRowIndex);

          // Tô màu nền cho dòng dữ liệu (xám nhạt)
          for (let c = 1; c <= totalCols; c++) {
            row.getCell(c).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF2F2F2" },
            };
          }

          // 5.1) Tên phòng (cột A = 1)
          row.getCell(1).value = inv.roomId?.name || "";

          // 5.2) Số người (cột B = 2)
          const totalMembers = inv.totalMembers ?? 0;
          row.getCell(2).value = totalMembers;

          // 5.3) Số điện pre/after/tiêu thụ (C, D, E)
          const elecPre = inv.elec?.pre ?? 0;
          const elecAfter = inv.elec?.after ?? 0;
          row.getCell(3).value = elecPre;
          row.getCell(4).value = elecAfter;
          row.getCell(5).value = elecAfter - elecPre;

          // 5.4) Số nước pre/after/tiêu thụ (F, G, H)
          const waterPre = inv.water?.pre ?? 0;
          const waterAfter = inv.water?.after ?? 0;
          row.getCell(6).value = waterPre;
          row.getCell(7).value = waterAfter;
          row.getCell(8).value = waterAfter - waterPre;

          // 5.5) Tiền điện (cột I = 9): lấy từ inv.services[].amount
          let elecAmount = 0;
          if (Array.isArray(inv.services)) {
            const s = inv.services.find((x) => x.name.toLowerCase().includes("điện"));
            if (s && s.amount !== undefined) elecAmount = s.amount;
          }
          row.getCell(9).value = elecAmount;

          // 5.6) Tiền nước (cột J = 10)
          let waterAmount = 0;
          if (Array.isArray(inv.services)) {
            const s = inv.services.find((x) => x.name.toLowerCase().includes("nước"));
            if (s && s.amount !== undefined) waterAmount = s.amount;
          }
          row.getCell(10).value = waterAmount;

          // 5.7) Tiền phòng (cột K = 11): lấy từ inv.roomId.price
          const roomPrice = inv.roomId?.price ?? 0;
          row.getCell(11).value = roomPrice;

          // 5.8) Các dịch vụ ngoài (L → L+S−1): lấy từ inv.services[].amount
          otherServices.forEach((srv, idx) => {
            let amount = 0;
            if (Array.isArray(inv.services)) {
              const s = inv.services.find((x) => x.name.trim() === srv.name);
              if (s && s.amount !== undefined) {
                amount = s.amount;
              }
            }
            const c = row.getCell(12 + idx);
            c.value = amount;
            c.alignment = { horizontal: "right" };
          });

          // 5.9) Tổng cộng (Cột colTotal)
          const totalAmount = inv.totalAmount ?? 0;
          row.getCell(colTotal).value = totalAmount;
          row.getCell(colTotal).alignment = { horizontal: "right" };

          // 5.10) Tình trạng (Cột colStatus)
          const statusCell = row.getCell(colStatus);
          if (inv.status === "UNPAID") {
            statusCell.value = "Chưa thanh toán";
          } else if (inv.status === "PAID") {
            statusCell.value = "Đã thanh toán";
          } else {
            statusCell.value = inv.status;
          }
          statusCell.alignment = { horizontal: "center" };

          dataRowIndex += 1;
        });

        //
        // 6) Kẻ border cho toàn bộ sub‐table (từ titleRow → dataRowIndex−1)
        //
        const subTableStart = currentRow - 2; // titleRow
        const subTableEnd = dataRowIndex - 1; // dòng cuối dữ liệu
        for (let r = subTableStart; r <= subTableEnd; r++) {
          const row = sheet.getRow(r);
          for (let c = 1; c <= totalCols; c++) {
            const cell = row.getCell(c);
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          }
        }

        // 7) Cập nhật currentRow để cách 2 dòng trống trước sub‐table tiếp theo
        currentRow = subTableEnd + 3;
      }

      //
      // C. Set độ rộng cột cho toàn sheet
      //
      sheet.columns = [
        { key: "phong", width: 20 }, // A
        { key: "so_nguoi", width: 10 }, // B
        { key: "elec_pre", width: 10 }, // C
        { key: "elec_after", width: 10 }, // D
        { key: "elec_cons", width: 12 }, // E
        { key: "water_pre", width: 10 }, // F
        { key: "water_after", width: 10 }, // G
        { key: "water_cons", width: 12 }, // H
        { key: "elec_total", width: 15 }, // I
        { key: "water_total", width: 15 }, // J
        { key: "room_price", width: 12 }, // K
        // Các cột dịch vụ động
        ...otherServices.map((_, idx) => ({ key: `service_${idx}`, width: 15 })),
        { key: "total_all", width: 14 }, // Tổng cộng
        { key: "status", width: 16 }, // Tình trạng
      ];
    }

    //
    // D. Gửi file về Client
    //
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    const fileName =
      month && year
        ? `HOADON_MULTIPLE_${String(month).padStart(2, "0")}-${year}.xlsx`
        : `HOADON_MULTIPLE_ALL.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  });
