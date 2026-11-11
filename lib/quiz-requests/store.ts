import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

export interface QuizAccessRequestItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  uniqueId: string;
  userRole: string;
  avatar?: string | null;
  classroomId?: string | null;
  classroomName?: string | null;
  message: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  adminNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuizRequestStats {
  total: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  revokedCount: number;
  globalFeatureEnabled: boolean;
}

const SETTINGS_FILE = path.join(process.cwd(), "data", "system_settings.json");
const REQUESTS_FILE = path.join(process.cwd(), "data", "quiz_requests.json");

// System Settings Helper
export function getGlobalQuizFeatureStatus(): boolean {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, "utf-8");
      const data = JSON.parse(content);
      if (typeof data.studentQuizGenerationEnabled === "boolean") {
        return data.studentQuizGenerationEnabled;
      }
    }
  } catch (err) {
    console.error("Error reading system settings:", err);
  }
  return true; // Enabled by default
}

export function setGlobalQuizFeatureStatus(enabled: boolean): boolean {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let existing: Record<string, any> = {};
    if (fs.existsSync(SETTINGS_FILE)) {
      try {
        existing = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      } catch (_) {}
    }

    existing.studentQuizGenerationEnabled = Boolean(enabled);
    existing.updatedAt = new Date().toISOString();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(existing, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("Error saving system settings:", err);
    return false;
  }
}

// File fallback helpers for requests
function readRequestsFromFile(): QuizAccessRequestItem[] {
  try {
    if (fs.existsSync(REQUESTS_FILE)) {
      const content = fs.readFileSync(REQUESTS_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Error reading quiz requests file:", err);
  }
  return [];
}

function writeRequestsToFile(items: QuizAccessRequestItem[]): boolean {
  try {
    const dir = path.dirname(REQUESTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify(items, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("Error writing quiz requests file:", err);
    return false;
  }
}

/**
 * Returns all quiz access requests sorted by newest first with live stats
 */
export async function getAllQuizRequests(): Promise<{
  requests: QuizAccessRequestItem[];
  stats: QuizRequestStats;
}> {
  const globalFeatureEnabled = getGlobalQuizFeatureStatus();
  try {
    const rows = await prisma.quizAccessRequest.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            uniqueId: true,
            role: true,
            avatar: true,
            canGenerateQuiz: true,
          },
        },
      },
    });

    if (rows && rows.length >= 0) {
      const mapped: QuizAccessRequestItem[] = rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.user?.name || "Anonymous Student",
        userEmail: r.user?.email || "N/A",
        uniqueId: r.user?.uniqueId || "N/A",
        userRole: r.user?.role || "student",
        avatar: r.user?.avatar || null,
        classroomId: r.classroomId,
        classroomName: r.classroomName,
        message: r.message,
        status: (r.status as any) || "PENDING",
        adminNote: r.adminNote,
        reviewedBy: r.reviewedBy,
        reviewedAt: r.reviewedAt?.toISOString() || null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));

      writeRequestsToFile(mapped);

      const stats: QuizRequestStats = {
        total: mapped.length,
        pendingCount: mapped.filter((r) => r.status === "PENDING").length,
        approvedCount: mapped.filter((r) => r.status === "APPROVED").length,
        rejectedCount: mapped.filter((r) => r.status === "REJECTED").length,
        revokedCount: mapped.filter((r) => r.status === "REVOKED").length,
        globalFeatureEnabled,
      };

      return { requests: mapped, stats };
    }
  } catch (err) {
    console.error("Prisma error in getAllQuizRequests, falling back to file:", err);
  }

  // Fallback to file storage
  const list = readRequestsFromFile().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const stats: QuizRequestStats = {
    total: list.length,
    pendingCount: list.filter((r) => r.status === "PENDING").length,
    approvedCount: list.filter((r) => r.status === "APPROVED").length,
    rejectedCount: list.filter((r) => r.status === "REJECTED").length,
    revokedCount: list.filter((r) => r.status === "REVOKED").length,
    globalFeatureEnabled,
  };

  return { requests: list, stats };
}

/**
 * Creates a new quiz access request for a student
 */
export async function createQuizRequest(data: {
  userId: string;
  classroomId?: string | null;
  classroomName?: string | null;
  message: string;
}): Promise<QuizAccessRequestItem> {
  const trimmedMsg = data.message.trim();

  // Check if user already has an active pending request in file or DB
  const filePending = readRequestsFromFile().find(
    (r) => r.userId === data.userId && r.status === "PENDING"
  );
  if (filePending) {
    throw new Error("User already has a pending quiz access request.");
  }

  try {
    const existingPending = await prisma.quizAccessRequest.findFirst({
      where: {
        userId: data.userId,
        status: "PENDING",
      },
    });
    if (existingPending) {
      throw new Error("User already has a pending quiz access request.");
    }

    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: {
        id: true,
        name: true,
        email: true,
        uniqueId: true,
        role: true,
        avatar: true,
      },
    });

    const created = await prisma.quizAccessRequest.create({
      data: {
        userId: data.userId,
        classroomId: data.classroomId || null,
        classroomName: data.classroomName || null,
        message: trimmedMsg,
        status: "PENDING",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            uniqueId: true,
            role: true,
            avatar: true,
          },
        },
      },
    });

    const item: QuizAccessRequestItem = {
      id: created.id,
      userId: created.userId,
      userName: created.user?.name || user?.name || "Student",
      userEmail: created.user?.email || user?.email || "N/A",
      uniqueId: created.user?.uniqueId || user?.uniqueId || "N/A",
      userRole: created.user?.role || user?.role || "student",
      avatar: created.user?.avatar || user?.avatar || null,
      classroomId: created.classroomId,
      classroomName: created.classroomName,
      message: created.message,
      status: "PENDING",
      adminNote: created.adminNote,
      reviewedBy: created.reviewedBy,
      reviewedAt: created.reviewedAt ? created.reviewedAt.toISOString() : null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };

    const currentList = readRequestsFromFile();
    currentList.unshift(item);
    writeRequestsToFile(currentList);

    return item;
  } catch (err) {
    console.error("Prisma error in createQuizRequest, saving to file:", err);
    const fallbackItem: QuizAccessRequestItem = {
      id: "req_" + Date.now(),
      userId: data.userId,
      userName: "Student",
      userEmail: "N/A",
      uniqueId: "N/A",
      userRole: "student",
      classroomId: data.classroomId || null,
      classroomName: data.classroomName || null,
      message: trimmedMsg,
      status: "PENDING",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const currentList = readRequestsFromFile();
    currentList.unshift(fallbackItem);
    writeRequestsToFile(currentList);
    return fallbackItem;
  }
}

/**
 * Updates status of a request: 'APPROVED', 'REJECTED', or 'REVOKED'.
 * Automatically sets canGenerateQuiz = true on approval, or false on reject/revoke.
 */
export async function updateQuizRequestStatus(
  id: string,
  newStatus: "APPROVED" | "REJECTED" | "REVOKED",
  adminNote?: string,
  reviewerEmail?: string
): Promise<QuizAccessRequestItem | null> {
  const shouldEnable = newStatus === "APPROVED";

  try {
    const existing = await prisma.quizAccessRequest.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (existing) {
      // 1. Update request record
      const updated = await prisma.quizAccessRequest.update({
        where: { id },
        data: {
          status: newStatus,
          adminNote: adminNote !== undefined ? adminNote : undefined,
          reviewedBy: reviewerEmail || "Admin",
          reviewedAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              uniqueId: true,
              role: true,
              avatar: true,
            },
          },
        },
      });

      // 2. Synchronize user's canGenerateQuiz permission flag
      await prisma.user.update({
        where: { id: existing.userId },
        data: { canGenerateQuiz: shouldEnable },
      });

      const item: QuizAccessRequestItem = {
        id: updated.id,
        userId: updated.userId,
        userName: updated.user?.name || "Student",
        userEmail: updated.user?.email || "N/A",
        uniqueId: updated.user?.uniqueId || "N/A",
        userRole: updated.user?.role || "student",
        avatar: updated.user?.avatar || null,
        classroomId: updated.classroomId,
        classroomName: updated.classroomName,
        message: updated.message,
        status: newStatus,
        adminNote: updated.adminNote,
        reviewedBy: updated.reviewedBy,
        reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };

      const fileList = readRequestsFromFile().map((r) => (r.id === id ? item : r));
      writeRequestsToFile(fileList);

      return item;
    }
  } catch (err) {
    console.error("Prisma error in updateQuizRequestStatus:", err);
  }

  // Fallback to file update
  const list = readRequestsFromFile();
  const idx = list.findIndex((r) => r.id === id);
  if (idx !== -1) {
    list[idx].status = newStatus;
    list[idx].adminNote = adminNote || list[idx].adminNote;
    list[idx].reviewedBy = reviewerEmail || "Admin";
    list[idx].reviewedAt = new Date().toISOString();
    list[idx].updatedAt = new Date().toISOString();
    writeRequestsToFile(list);
    return list[idx];
  }

  return null;
}

/**
 * Revoke or turn off quiz permission directly for a user ID
 */
export async function setUserQuizPermission(
  userId: string,
  canGenerateQuiz: boolean,
  reviewerEmail?: string
): Promise<boolean> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { canGenerateQuiz },
    });

    if (!canGenerateQuiz) {
      // Mark active requests as REVOKED
      await prisma.quizAccessRequest.updateMany({
        where: { userId, status: "APPROVED" },
        data: {
          status: "REVOKED",
          adminNote: "Turned off by administrator",
          reviewedBy: reviewerEmail || "Admin",
          reviewedAt: new Date(),
        },
      });
    }
    return true;
  } catch (err) {
    console.error("Error setting user quiz permission:", err);
    return false;
  }
}

/**
 * Deletes a quiz request
 */
export async function deleteQuizRequest(id: string): Promise<boolean> {
  try {
    await prisma.quizAccessRequest.delete({ where: { id } });
  } catch (err) {
    console.error("Prisma error deleting quiz request:", err);
  }

  const list = readRequestsFromFile().filter((r) => r.id !== id);
  writeRequestsToFile(list);
  return true;
}

/**
 * Checks a specific student's request status and permission
 */
export async function getStudentQuizStatus(userId: string): Promise<{
  canGenerateQuiz: boolean;
  globalFeatureEnabled: boolean;
  latestRequest: QuizAccessRequestItem | null;
}> {
  const globalFeatureEnabled = getGlobalQuizFeatureStatus();

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        canGenerateQuiz: true,
        quizRequests: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const latest = user?.quizRequests?.[0];
    const latestItem: QuizAccessRequestItem | null = latest
      ? {
          id: latest.id,
          userId: latest.userId,
          userName: "",
          userEmail: "",
          uniqueId: "",
          userRole: "student",
          classroomId: latest.classroomId,
          classroomName: latest.classroomName,
          message: latest.message,
          status: (latest.status as any) || "PENDING",
          adminNote: latest.adminNote,
          reviewedBy: latest.reviewedBy,
          reviewedAt: latest.reviewedAt?.toISOString() || null,
          createdAt: latest.createdAt.toISOString(),
          updatedAt: latest.updatedAt.toISOString(),
        }
      : null;

    return {
      canGenerateQuiz: Boolean(user?.canGenerateQuiz && globalFeatureEnabled),
      globalFeatureEnabled,
      latestRequest: latestItem,
    };
  } catch (err) {
    console.error("Error fetching student quiz status:", err);
  }

  const fileRequests = readRequestsFromFile().filter((r) => r.userId === userId);
  return {
    canGenerateQuiz: globalFeatureEnabled,
    globalFeatureEnabled,
    latestRequest: fileRequests[0] || null,
  };
}
