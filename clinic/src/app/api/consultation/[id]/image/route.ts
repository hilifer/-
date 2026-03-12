import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_TYPES = ["TONGUE", "FACE", "FINGER"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const VALID_MIME = ["image/jpeg", "image/png", "image/webp"];

// POST: upload an image for a consultation
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;

  const consultation = await prisma.consultation.findUnique({
    where: { id },
  });

  if (!consultation || consultation.patientId !== session.user.id) {
    return NextResponse.json({ error: "问诊不存在" }, { status: 404 });
  }

  const body = await req.json();
  const { type, data, mimeType } = body;

  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json(
      { error: "无效的图片类型，支持：舌诊(TONGUE)、面诊(FACE)、指纹(FINGER)" },
      { status: 400 }
    );
  }

  if (!data || typeof data !== "string") {
    return NextResponse.json({ error: "缺少图片数据" }, { status: 400 });
  }

  // Validate base64 size (rough check: base64 is ~4/3 of original)
  const estimatedSize = (data.length * 3) / 4;
  if (estimatedSize > MAX_SIZE) {
    return NextResponse.json(
      { error: "图片大小不能超过5MB" },
      { status: 400 }
    );
  }

  const mime = mimeType || "image/jpeg";
  if (!VALID_MIME.includes(mime)) {
    return NextResponse.json(
      { error: "不支持的图片格式，请上传 JPG、PNG 或 WebP" },
      { status: 400 }
    );
  }

  // Check if an image of the same type already exists — replace it
  const existing = await prisma.consultationImage.findFirst({
    where: { consultationId: id, type },
  });

  let image;
  if (existing) {
    image = await prisma.consultationImage.update({
      where: { id: existing.id },
      data: { data, mimeType: mime },
    });
  } else {
    image = await prisma.consultationImage.create({
      data: {
        consultationId: id,
        type,
        data,
        mimeType: mime,
      },
    });
  }

  return NextResponse.json({
    id: image.id,
    type: image.type,
    mimeType: image.mimeType,
    createdAt: image.createdAt,
  });
}

// GET: list images for a consultation (without full data, for thumbnails)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;

  const consultation = await prisma.consultation.findUnique({
    where: { id },
  });

  if (!consultation) {
    return NextResponse.json({ error: "问诊不存在" }, { status: 404 });
  }

  if (
    session.user.role === "PATIENT" &&
    consultation.patientId !== session.user.id
  ) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const images = await prisma.consultationImage.findMany({
    where: { consultationId: id },
    select: {
      id: true,
      type: true,
      mimeType: true,
      data: true,
      description: true,
      createdAt: true,
    },
  });

  return NextResponse.json(images);
}
