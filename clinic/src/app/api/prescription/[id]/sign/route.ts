import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Doctor signs the prescription
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "DOCTOR") {
    return NextResponse.json({ error: "仅医生可签发处方" }, { status: 403 });
  }

  const { id } = await params;
  const prescription = await prisma.prescription.findUnique({ where: { id } });

  if (!prescription) {
    return NextResponse.json({ error: "处方不存在" }, { status: 404 });
  }

  if (prescription.status === "SIGNED") {
    return NextResponse.json({ error: "处方已签发" }, { status: 400 });
  }

  // Check for unresolved safety errors
  const warnings = JSON.parse(prescription.safetyWarnings);
  const errors = warnings.filter(
    (w: { severity: string }) => w.severity === "ERROR"
  );
  if (errors.length > 0) {
    return NextResponse.json(
      { error: "存在未解决的安全警告，无法签发", warnings: errors },
      { status: 400 }
    );
  }

  const updated = await prisma.prescription.update({
    where: { id },
    data: {
      status: "SIGNED",
      doctorId: session.user.id,
      signedAt: new Date(),
    },
  });

  return NextResponse.json(updated);
}
