import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { name, phone, password, role } = await req.json();

  if (!name || !phone || !password) {
    return NextResponse.json({ error: "请填写所有必填字段" }, { status: 400 });
  }

  if (!/^1\d{10}$/.test(phone)) {
    return NextResponse.json({ error: "手机号格式不正确" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "密码至少6位" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    return NextResponse.json({ error: "该手机号已注册" }, { status: 409 });
  }

  const validRoles = ["PATIENT", "DOCTOR"];
  const userRole = validRoles.includes(role) ? role : "PATIENT";

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, phone, passwordHash, role: userRole },
  });

  return NextResponse.json({
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
  });
}
