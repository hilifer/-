import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkPrescriptionSafety } from "@/lib/safety-check";

// Doctor reviews and modifies prescription
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "DOCTOR") {
    return NextResponse.json({ error: "仅医生可操作" }, { status: 403 });
  }

  const { id } = await params;
  const { herbs, adoptionLevel, doctorNotes } = await req.json();

  const prescription = await prisma.prescription.findUnique({ where: { id } });
  if (!prescription) {
    return NextResponse.json({ error: "处方不存在" }, { status: 404 });
  }

  // Re-run safety check on modified herbs
  const parsedHerbs = typeof herbs === "string" ? JSON.parse(herbs) : herbs;
  const safetyWarnings = checkPrescriptionSafety(parsedHerbs);

  const updated = await prisma.prescription.update({
    where: { id },
    data: {
      herbs: JSON.stringify(parsedHerbs),
      adoptionLevel,
      doctorNotes: doctorNotes || "",
      doctorId: session.user.id,
      safetyWarnings: JSON.stringify(safetyWarnings),
    },
  });

  return NextResponse.json({ prescription: updated, safetyWarnings });
}
