import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  createQuizRequest,
  getStudentQuizStatus,
  getGlobalQuizFeatureStatus,
} from "@/lib/quiz-requests/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/quiz-requests
 * Returns current user's quiz access permission, global feature status, and latest request
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    let userId = session?.id;

    if (!userId) {
      const emailCookie = req.cookies.get("classpulse_user_email")?.value;
      if (emailCookie) {
        const u = await prisma.user.findUnique({
          where: { email: emailCookie },
          select: { id: true },
        });
        if (u) userId = u.id;
      }
    }

    if (!userId) {
      return NextResponse.json({
        canGenerateQuiz: false,
        globalFeatureEnabled: getGlobalQuizFeatureStatus(),
        latestRequest: null,
      });
    }

    const status = await getStudentQuizStatus(userId);
    return NextResponse.json(status);
  } catch (error: any) {
    console.error("Error in GET /api/quiz-requests:", error);
    return NextResponse.json(
      { error: "Internal Server Error", canGenerateQuiz: false },
      { status: 500 }
    );
  }
}

/**
 * POST /api/quiz-requests
 * Student submits an access request with a message to the admin
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    let userId = session?.id;

    if (!userId) {
      const emailCookie = req.cookies.get("classpulse_user_email")?.value;
      if (emailCookie) {
        const u = await prisma.user.findUnique({
          where: { email: emailCookie },
          select: { id: true },
        });
        if (u) userId = u.id;
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Please log in to submit a quiz generation request." },
        { status: 401 }
      );
    }

    // Check if the feature is turned off globally by admin
    const isGlobalEnabled = getGlobalQuizFeatureStatus();
    if (!isGlobalEnabled) {
      return NextResponse.json(
        {
          error:
            "Student quiz generation is currently turned off by the system administration.",
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { message, classroomId, classroomName } = body;

    if (!message || typeof message !== "string" || message.trim().length < 10) {
      return NextResponse.json(
        {
          error:
            "Please provide a detailed message (minimum 10 characters) explaining why you would like to generate quizzes.",
        },
        { status: 400 }
      );
    }

    // Check if user already has an active pending request
    const existingPending = await prisma.quizAccessRequest.findFirst({
      where: {
        userId,
        status: "PENDING",
      },
    });

    if (existingPending) {
      return NextResponse.json(
        {
          error:
            "You already have a pending request awaiting administrator review.",
          request: existingPending,
        },
        { status: 409 }
      );
    }

    const newRequest = await createQuizRequest({
      userId,
      classroomId,
      classroomName,
      message,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Your quiz access request has been sent to the administrator.",
        request: newRequest,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in POST /api/quiz-requests:", error);
    return NextResponse.json(
      { error: error.message || "Failed to submit request." },
      { status: 500 }
    );
  }
}
