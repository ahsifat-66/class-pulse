import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { checkHasAdminAccess, resolveUserRole } from "@/lib/auth/roles";
import {
  getAllQuizRequests,
  updateQuizRequestStatus,
  deleteQuizRequest,
  setGlobalQuizFeatureStatus,
  setUserQuizPermission,
} from "@/lib/quiz-requests/store";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function verifyAdminCaller(req: NextRequest) {
  const session = await getSessionUser(req);
  const callerEmail = session?.email;

  if (!callerEmail || !session?.id) {
    return null;
  }

  const dbUser = await prisma.user.findUnique({
    where: { email: callerEmail },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!dbUser) return null;

  const role = resolveUserRole(dbUser);
  const caller = { ...dbUser, role };

  if (!checkHasAdminAccess(caller)) {
    return null;
  }

  return caller;
}

export async function GET(req: NextRequest) {
  try {
    const caller = await verifyAdminCaller(req);
    if (!caller) {
      return NextResponse.json(
        { error: "Access denied. Administrator privileges required." },
        { status: 403 }
      );
    }

    const { requests, stats } = await getAllQuizRequests();

    return NextResponse.json({
      requests,
      stats,
    });
  } catch (error: any) {
    console.error("Admin quiz-requests GET error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const caller = await verifyAdminCaller(req);
    if (!caller) {
      return NextResponse.json(
        { error: "Access denied. Administrator privileges required." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { action, id, userId, status, adminNote, enabled } = body;

    // 1. Action: Master Global Toggle (Turn ON / OFF student quiz generation system-wide)
    if (action === "toggle_global_feature") {
      if (typeof enabled !== "boolean") {
        return NextResponse.json(
          { error: "A boolean 'enabled' parameter is required for toggle_global_feature." },
          { status: 400 }
        );
      }

      setGlobalQuizFeatureStatus(enabled);
      const { stats } = await getAllQuizRequests();

      return NextResponse.json({
        success: true,
        message: enabled
          ? "Student quiz generation has been turned ON globally."
          : "Student quiz generation has been turned OFF globally.",
        stats,
      });
    }

    // 2. Action: Direct User Permission Toggle (Turn ON / OFF for specific student)
    if (action === "toggle_user_permission") {
      if (!userId || typeof enabled !== "boolean") {
        return NextResponse.json(
          { error: "Valid 'userId' and boolean 'enabled' are required." },
          { status: 400 }
        );
      }

      const success = await setUserQuizPermission(userId, enabled, caller.email);
      if (!success) {
        return NextResponse.json(
          { error: "Failed to update user quiz permission." },
          { status: 500 }
        );
      }

      const { requests, stats } = await getAllQuizRequests();
      return NextResponse.json({
        success: true,
        message: enabled
          ? "Quiz generation permission granted for user."
          : "Quiz generation permission turned OFF for user.",
        requests,
        stats,
      });
    }

    // 3. Action: Request Status Update (Approve, Reject, or Revoke)
    if (!id) {
      return NextResponse.json(
        { error: "A valid request 'id' is required." },
        { status: 400 }
      );
    }

    let targetStatus: "APPROVED" | "REJECTED" | "REVOKED" = "APPROVED";
    if (action === "approve" || status === "APPROVED") {
      targetStatus = "APPROVED";
    } else if (action === "reject" || status === "REJECTED") {
      targetStatus = "REJECTED";
    } else if (action === "revoke" || status === "REVOKED") {
      targetStatus = "REVOKED";
    } else {
      return NextResponse.json(
        { error: "Invalid action. Supported: 'approve', 'reject', 'revoke', 'toggle_global_feature', 'toggle_user_permission'." },
        { status: 400 }
      );
    }

    const updated = await updateQuizRequestStatus(
      id,
      targetStatus,
      adminNote,
      caller.email
    );

    if (!updated) {
      return NextResponse.json(
        { error: "Request not found or failed to update." },
        { status: 404 }
      );
    }

    const { requests, stats } = await getAllQuizRequests();

    const actionText =
      targetStatus === "APPROVED"
        ? "approved and quiz permission granted"
        : targetStatus === "REJECTED"
        ? "rejected"
        : "revoked and quiz permission turned OFF";

    return NextResponse.json({
      success: true,
      message: `Request ${actionText} successfully.`,
      request: updated,
      requests,
      stats,
    });
  } catch (error: any) {
    console.error("Admin quiz-requests PATCH error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update request." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const caller = await verifyAdminCaller(req);
    if (!caller) {
      return NextResponse.json(
        { error: "Access denied. Administrator privileges required." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Request ID is required." },
        { status: 400 }
      );
    }

    await deleteQuizRequest(id);
    const { requests, stats } = await getAllQuizRequests();

    return NextResponse.json({
      success: true,
      message: "Request deleted successfully.",
      requests,
      stats,
    });
  } catch (error: any) {
    console.error("Admin quiz-requests DELETE error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
