const InvoiceModel = require("../models/Invoice");
const RoomModel = require("../models/Room");
const HostelModel = require("../models/Hostel");
const AppError = require("../utils/AppError");

exports.createInvoice = async ({
  roomId,
  hostelId,
  price,
  year,
  month,
  water,
  elec,
  services = [],
  totalMembers = 1,
  images = [],
}) => {
  // 1. Validate các trường bắt buộc
  if (!roomId) {
    throw new AppError("roomId là bắt buộc", 400);
  }
  if (!year || typeof year !== "number") {
    throw new AppError("year (năm) là bắt buộc và phải là số", 400);
  }
  if (!month || typeof month !== "number" || month < 1 || month > 12) {
    throw new AppError("month (tháng) là bắt buộc và phải từ 1 đến 12", 400);
  }
  if (!water || typeof water.pre !== "number" || typeof water.after !== "number") {
    throw new AppError("Trường water phải chứa { pre: Number, after: Number }", 400);
  }
  if (!elec || typeof elec.pre !== "number" || typeof elec.after !== "number") {
    throw new AppError("Trường elec phải chứa { pre: Number, after: Number }", 400);
  }
  if (!Array.isArray(services) || services.length < 2) {
    throw new AppError("services phải là mảng và ít nhất gồm 2 phần tử (điện, nước)", 400);
  }
  // totalMember có thể là 0, nhưng phải là Number
  if (typeof totalMembers !== "number") {
    throw new AppError("totalMember phải là số", 400);
  }

  // 2. Kiểm tra Room có tồn tại không
  const room = await RoomModel.findById(roomId);
  if (!room) {
    throw new AppError("Không tìm thấy Room tương ứng với roomId", 404);
  }
  if (room.price != price) {
    throw new AppError("Giá phòng không khớp", 400);
  }

  // 4. Tính toán amount cho từng phần tử trong services
  const computedServices = services.map((svc, index) => {
    const { name, price, unit } = svc;

    if (typeof name !== "string" || typeof price !== "number" || typeof unit !== "string") {
      throw new AppError(
        "Mỗi phần tử trong services phải có { name: String, price: Number, unit: String }",
        400
      );
    }

    let amount = 0;

    if (index === 0) {
      // Phần tử đầu tiên → Điện
      // amount = (elec.after - elec.pre) * price
      amount = (elec.after - elec.pre) * price;
    } else if (index === 1) {
      // Phần tử thứ hai → Nước
      if (unit === "đ/số") {
        // amount = (water.after - water.pre) * price
        amount = (water.after - water.pre) * price;
      } else if (unit === "đ/người") {
        // amount = price * totalMember
        amount = price * totalMembers;
      } else {
        throw new AppError("Nước chỉ hỗ trợ unit là 'đ/số' hoặc 'đ/người'", 400);
      }
    } else {
      // Các dịch vụ khác
      if (unit === "đ/người") {
        amount = price * totalMembers;
      } else if (unit === "đ/phòng") {
        amount = price;
      } else {
        throw new AppError("Các dịch vụ khác chỉ hỗ trợ unit 'đ/người' hoặc 'đ/phòng'", 400);
      }
    }

    return {
      name,
      price,
      unit,
      amount,
    };
  });

  // 5. Tính tổng tổng tiền (totalAmount) bằng tổng amount của tất cả services
  const totalAmount =
    price +
    computedServices.reduce(
      (sum, svc) => sum + (typeof svc.amount === "number" ? svc.amount : 0),
      0
    );

  // 3. Kiểm tra đã có hóa đơn cho tháng/năm này chưa (unique index)
  const existing = await InvoiceModel.findOne({ roomId, year, month });
  if (existing) {
    const updatedInvoice = await InvoiceModel.findByIdAndUpdate(existing._id, {
      roomId,
      hostelId,
      year,
      month,
      issuedDate: new Date(),
      water: {
        pre: water.pre,
        after: water.after,
      },
      elec: {
        pre: elec.pre,
        after: elec.after,
      },
      services: computedServices,
      totalMembers,
      totalAmount,
      images: Array.isArray(images) ? images : [],
      status: "UNPAID",
    });

    return updatedInvoice;
  }

  // 6. Tạo hóa đơn mới
  const newInvoice = await InvoiceModel.create({
    roomId,
    hostelId,
    year,
    month,
    issuedDate: new Date(),
    water: {
      pre: water.pre,
      after: water.after,
    },
    elec: {
      pre: elec.pre,
      after: elec.after,
    },
    services: computedServices,
    totalMembers,
    totalAmount,
    images: Array.isArray(images) ? images : [],
    status: "UNPAID",
  });

  return newInvoice;
};

exports.getInvoiceByMonth = async ({ roomId, year, month }) => {
  if (!roomId) {
    throw new AppError("roomId là bắt buộc", 400);
  }
  if (!year || typeof year !== "number") {
    throw new AppError("year (năm) là bắt buộc và phải là số", 400);
  }
  if (!month || typeof month !== "number" || month < 1 || month > 12) {
    throw new AppError("month (tháng) là bắt buộc và phải từ 1 đến 12", 400);
  }

  // Thử tìm invoice đã tạo cho tháng/năm này
  const existing = await InvoiceModel.findOne({ roomId, year, month }).lean();

  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth === 13) {
    nextMonth = 1;
    nextYear = year + 1;
  }

  // Kiểm tra invoice của tháng sau đã tồn tại chưa
  const nextInvoice = await InvoiceModel.findOne({
    roomId,
    year: nextYear,
    month: nextMonth,
  }).lean();

  // Nếu đã có invoice tháng sau → không cho chỉnh sửa (isEdit = false), ngược lại isEdit = true
  const isEdit = nextInvoice ? false : true;
  if (existing) {
    return {
      ...existing,
      isEdit,
    };
  }

  // Nếu chưa có, tìm invoice tháng trước (previous month)
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = year - 1;
  }

  const prevInvoice = await InvoiceModel.findOne({
    roomId,
    year: prevYear,
    month: prevMonth,
  }).lean();

  // 3. Xác định elec.pre và water.pre
  let prevElec = 0;
  let prevWater = 0;
  if (prevInvoice) {
    // Lấy giá trị elec.after và water.after của invoice tháng trước
    prevElec = prevInvoice.elec.after;
    prevWater = prevInvoice.water.after;
  } else {
    // Nếu không có invoice tháng trước, giữ mặc định 0
    prevElec = 0;
    prevWater = 0;
  }

  // 4. Trả về “template” invoice (các trường còn lại để trống hoặc null)
  return {
    _id: null,
    roomId,
    year,
    month,
    issuedDate: null,
    water: {
      pre: prevWater,
      after: null,
    },
    elec: {
      pre: prevElec,
      after: null,
    },
    services: [], // chưa có dịch vụ nào
    totalMember: null,
    totalAmount: null,
    images: [],
    status: "UNPAID",
    createdAt: null,
    updatedAt: null,
    isEdit,
  };
};

exports.getAllInvoicesOfRoom = async (roomId) => {
  if (!roomId) {
    throw new AppError("roomId là bắt buộc", 400);
  }

  // Tìm tất cả invoice theo roomId, sắp xếp year DESC, month DESC
  const invoices = await InvoiceModel.find({ roomId })
    .sort({ year: -1, month: -1 })
    .lean();

  return invoices;
};

exports.updateInvoiceStatus = async (invoiceId, newStatus) => {
  if (!invoiceId) {
    throw new AppError("invoiceId là bắt buộc", 400);
  }
  if (
    !["UNPAID", "PARTIALLY_PAID", "PAID", "CANCELLED"].includes(newStatus)
  ) {
    throw new AppError(
      "newStatus không hợp lệ. Phải là UNPAID, PARTIALLY_PAID, PAID hoặc CANCELLED",
      400
    );
  }

  const invoice = await InvoiceModel.findById(invoiceId);
  if (!invoice) {
    throw new AppError("Không tìm thấy hóa đơn tương ứng", 404);
  }

  invoice.status = newStatus;
  await invoice.save();
  return invoice;
};

exports.getInvoicesForExport = async ({ month, year }) => {
  const filter = {};
  if (typeof month === "number" && typeof year === "number") {
    filter.month = month;
    filter.year = year;
  }

  // Tìm tất cả hóa đơn (đã populate roomId để có tên phòng)
  const invoices = await InvoiceModel.find(filter)
    .populate("roomId", "name hostelId")
    .lean();

  return invoices;
};

exports.getAllHostels = async (userId) => {
  const hostels = await HostelModel.find({ownerId: userId}).lean();
  return hostels;
};


exports.getInvoicesByHostel = async ({ hostelId, month, year }) => {
  if (!hostelId) throw new AppError("hostelId là bắt buộc", 400);

  const filter = { hostelId };
  if (typeof month === "number" && typeof year === "number") {
    filter.month = month;
    filter.year  = year;
  }
  // Dùng populate("roomId", "name") để lấy tên phòng
  const invoices = await InvoiceModel.find(filter)
    .populate("roomId", "name price")
    .lean();

  return invoices;
};