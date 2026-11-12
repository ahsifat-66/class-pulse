"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Clock,
  BookOpen,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Sliders,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { useUser } from "@/context/UserContext";

export type StudentQuizAccessState = "loading" | "not_requested" | "pending" | "approved";

export interface StudentAiQuizGeneratorProps {
  classroomId: string;
  classroomName?: string;
  gradeLevel?: string;
  assignedTextbooks?: Array<{
    id?: string;
    title?: string;
    subject?: string;
    grade?: string;
    driveUrl?: string | null;
    coverImage?: string | null;
  }>;
  onQuizStarted: (quiz: any) => void;
  onQuizCreated?: () => void;
  className?: string;
}

const DEFAULT_SUBJECTS = [
  { name: "General Science", bn: "সাধারণ বিজ্ঞান" },
  { name: "Mathematics", bn: "গণিত" },
  { name: "Physics", bn: "পদার্থবিজ্ঞান" },
  { name: "Chemistry", bn: "রসায়ন" },
  { name: "Biology", bn: "জীববিজ্ঞান" },
  { name: "ICT", bn: "তথ্য ও যোগাযোগ প্রযুক্তি" },
  { name: "English", bn: "ইংরেজি" },
  { name: "Bangla", bn: "বাংলা" },
];

const TIME_LIMIT_OPTIONS = [5, 10, 15, 20, 30] as const;
const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20] as const;
const DIFFICULTY_OPTIONS = ["Easy", "Medium", "Hard"] as const;

export default function StudentAiQuizGenerator({
  classroomId,
  classroomName,
  gradeLevel = "Class 9-10",
  assignedTextbooks = [],
  onQuizStarted,
  onQuizCreated,
  className = "",
}: StudentAiQuizGeneratorProps) {
  const { language } = useLanguage();
  const { currentUser } = useUser();
  const isBn = language === "bn";

  // Access State: 'loading' | 'not_requested' | 'pending' | 'approved'
  const [accessState, setAccessState] = useState<StudentQuizAccessState>("loading");
  const [latestRequest, setLatestRequest] = useState<any | null>(null);

  // Request Form State
  const [requestNote, setRequestNote] = useState("");
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [requestSuccessMsg, setRequestSuccessMsg] = useState("");

  // Quiz Generator Form State
  const [selectedSubject, setSelectedSubject] = useState<string>(
    assignedTextbooks[0]?.subject || assignedTextbooks[0]?.title || "General Science"
  );
  const [selectedBook, setSelectedBook] = useState<any | null>(assignedTextbooks[0] || null);
  const [chapter, setChapter] = useState("");
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(15);

  // Generation & Submission State
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  // 1. Fetch Student Access Status
  const fetchAccessStatus = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await fetch("/api/quiz-requests", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const req = data.latestRequest;
        setLatestRequest(req);

        // Strict state evaluation
        if (data.canGenerateQuiz || currentUser.canGenerateQuiz || req?.status === "APPROVED") {
          setAccessState("approved");
        } else if (req?.status === "PENDING") {
          setAccessState("pending");
        } else {
          // Default start state: not_requested
          setAccessState("not_requested");
        }
      } else {
        setAccessState("not_requested");
      }
    } catch (err) {
      console.error("Failed to fetch student quiz access status:", err);
      setAccessState("not_requested");
    }
  }, [currentUser]);

  useEffect(() => {
    fetchAccessStatus();
  }, [fetchAccessStatus]);

  // 2. Submit Access Request
  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = requestNote.trim();
    if (trimmed.length < 10) {
      setRequestError(
        isBn
          ? "অনুগ্রহ করে কমপক্ষে ১০ অক্ষরের একটি ব্যাখ্যা লিখুন।"
          : "Please write at least 10 characters explaining why you want AI quiz access."
      );
      return;
    }

    try {
      setIsSubmittingRequest(true);
      setRequestError("");
      setRequestSuccessMsg("");

      const res = await fetch("/api/quiz-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classroomId,
          classroomName: classroomName || "Classroom",
          message: trimmed,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit request.");
      }

      setLatestRequest(data.request);
      setAccessState("pending");
      setRequestNote("");
      setRequestSuccessMsg(
        isBn
          ? "আপনার আবেদন সফলভাবে জমা দেওয়া হয়েছে। এডমিনের অনুমোদনের পর কুইজ জেনারেটর আনলক হবে।"
          : "Your request has been submitted to the administrator for review."
      );
    } catch (err: any) {
      setRequestError(err.message || "Failed to submit request.");
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  // 3. Generate and Launch Practice Quiz
  const handleGenerateAndStartQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chapter.trim()) {
      setGenError(
        isBn
          ? "অনুগ্রহ করে অধ্যায় বা বিষয়বস্তুর নাম উল্লেখ করুন।"
          : "Please specify the chapter or topic name."
      );
      return;
    }

    try {
      setIsGenerating(true);
      setGenError("");

      // Fast, lightweight Gemini generation (fastMode: true skips slow Drive downloads)
      const genRes = await fetch("/api/quiz/generate-from-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveUrl: selectedBook?.driveUrl || "",
          chapter: chapter.trim(),
          difficulty,
          numberOfQuestions: questionCount,
          bookTitle: selectedBook?.title || selectedSubject,
          subject: selectedSubject,
          gradeLevel,
          fastMode: true,
        }),
      });

      const genData = await genRes.json();
      if (!genRes.ok || !Array.isArray(genData.questions) || genData.questions.length === 0) {
        throw new Error(genData.error || "Failed to generate questions with AI.");
      }

      // Automatically format and save quiz to classroom with zero question exposure beforehand
      const quizTitle = isBn
        ? `${selectedSubject}: ${chapter.trim()}`
        : `${selectedSubject}: ${chapter.trim()}`;

      const createRes = await fetch(`/api/classrooms/${classroomId}/quizzes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: quizTitle,
          description: isBn
            ? `শিক্ষার্থী স্ব-মূল্যায়ন কুইজ (${selectedSubject} - ${chapter.trim()})`
            : `Student self-assessment practice test on ${selectedSubject} - ${chapter.trim()}`,
          timeLimitMinutes: Number(timeLimitMinutes) || 15,
          questions: genData.questions.map((q: any) => ({
            question: q.question,
            options: q.options,
            correctOptionIndex: typeof q.answerIndex === "number" ? q.answerIndex : (q.correctOptionIndex ?? 0),
            points: Number(q.points) || 1,
            explanation: q.explanation || q.rationale || undefined,
            pageReference: q.pageReference || undefined,
          })),
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok || !createData.quiz) {
        throw new Error(createData.error || "Failed to create practice quiz.");
      }

      // Immediately launch live test runner with live timer (zero spoilers)
      if (onQuizCreated) onQuizCreated();
      onQuizStarted(createData.quiz);
    } catch (err: any) {
      console.error("Student quiz generation error:", err);
      setGenError(err.message || "Failed to generate practice quiz.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      className={`relative w-full rounded-3xl border border-slate-800 bg-slate-900/95 dark:bg-zinc-950 p-6 sm:p-7 text-slate-100 shadow-xl min-h-[290px] flex flex-col justify-between transition-all duration-200 ${className}`}
    >
      {/* ============================================================== */}
      {/* 1. LOADING SKELETON (Prevents UI Layout Shift during query)     */}
      {/* ============================================================== */}
      {accessState === "loading" && (
        <div className="space-y-4 animate-pulse py-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-800 shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-4 w-48 bg-slate-800 rounded-md" />
              <div className="h-3 w-72 bg-slate-800/60 rounded-md" />
            </div>
          </div>
          <div className="h-24 w-full bg-slate-800/50 rounded-2xl" />
          <div className="flex justify-end">
            <div className="h-10 w-36 bg-slate-800 rounded-2xl" />
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. STATE: NOT_REQUESTED (Initial request form with textarea)    */}
      {/* ============================================================== */}
      {accessState === "not_requested" && (
        <form onSubmit={handleSendRequest} className="space-y-5 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
                <Sparkles size={22} strokeWidth={1.8} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    {isBn ? "শিক্ষার্থী এআই কুইজ জেনারেটর" : "Student AI Quiz Generator"}
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60 uppercase tracking-wider">
                    {isBn ? "অনুমতি প্রয়োজন" : "Access Required"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isBn
                    ? "পাঠ্যবই থেকে আনলিমিটেড স্ব-মূল্যায়ন কুইজ তৈরির সুবিধা পেতে এডমিনের কাছে আবেদন পাঠান।"
                    : "Request one-time approval from admin to unlock unlimited AI practice tests."}
                </p>
              </div>
            </div>
          </div>

          {/* Custom Note / Message Textarea */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>{isBn ? "এডমিনের জন্য নোট বা বার্তা (আবশ্যক)" : "Custom Note / Message to Admin"}</span>
              <span className="text-[11px] font-normal text-slate-500">
                {isBn ? "কমপক্ষে ১০ অক্ষর" : "min. 10 chars"}
              </span>
            </label>
            <textarea
              value={requestNote}
              onChange={(e) => setRequestNote(e.target.value)}
              placeholder={
                isBn
                  ? "যেমন: আমি বোর্ড পরীক্ষার প্রস্তুতির জন্য নিয়মিত অধ্যায়ভিত্তিক কুইজ অনুশীলন করতে চাই। দয়া করে অনুমতি দিন..."
                  : "e.g. I would like to create chapter practice quizzes for my upcoming board exams..."
              }
              rows={3}
              className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all resize-none"
              required
            />
          </div>

          {requestError && (
            <div className="p-3 rounded-2xl bg-rose-950/40 border border-rose-800/50 text-xs font-medium text-rose-300 flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{requestError}</span>
            </div>
          )}

          {/* Submit Request Button */}
          <div className="flex items-center justify-between pt-1">
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-indigo-400" />
              <span>{isBn ? "একবার অনুমোদিত হলে সর্বদা আনলক থাকবে" : "One-time approval grants unlimited generation"}</span>
            </div>
            <button
              type="submit"
              disabled={isSubmittingRequest || requestNote.trim().length < 10}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-lg shadow-indigo-600/20 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none min-h-[42px]"
            >
              {isSubmittingRequest ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{isBn ? "আবেদন পাঠানো হচ্ছে..." : "Sending Request..."}</span>
                </>
              ) : (
                <>
                  <Send size={15} />
                  <span>{isBn ? "আবেদন পাঠান" : "Send Request for AI Quiz Access"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* ============================================================== */}
      {/* 3. STATE: PENDING (Calm pending review card - no duplicate form) */}
      {/* ============================================================== */}
      {accessState === "pending" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
                <Clock size={22} strokeWidth={1.8} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    {isBn ? "কুইজ আবেদন পর্যালোচনাধীন" : "Quiz Request Pending Review"}
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                    {isBn ? "প্রক্রিয়াধীন" : "Pending"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isBn
                    ? "আপনার আবেদনটি এডমিনের অনুমোদনের অপেক্ষায় রয়েছে। অনুমোদনের সাথে সাথে এআই জেনারেটর আনলক হবে।"
                    : "Your request is currently awaiting administrator approval. Once approved, the generator will unlock."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchAccessStatus}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all border border-slate-700/60"
            >
              <RefreshCw size={13} />
              <span>{isBn ? "স্ট্যাটাস রিফ্রেশ" : "Refresh Status"}</span>
            </button>
          </div>

          {/* Submitted Request Summary Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-semibold text-slate-300">{isBn ? "আপনার প্রেরিত বার্তা:" : "Your Submitted Note:"}</span>
              {latestRequest?.createdAt && (
                <span>{new Date(latestRequest.createdAt).toLocaleDateString()}</span>
              )}
            </div>
            <p className="text-xs text-slate-300 italic bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
              &quot;{latestRequest?.message || requestSuccessMsg || "Student access request submitted"}&quot;
            </p>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. STATE: APPROVED (Request UI completely disappears!          */}
      {/*    Reveals Full AI Quiz Generator Form for Unlimited Tests)    */}
      {/* ============================================================== */}
      {accessState === "approved" && (
        <form onSubmit={handleGenerateAndStartQuiz} className="space-y-5 animate-in fade-in duration-200">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                <Sparkles size={22} strokeWidth={1.8} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    {isBn ? "এআই অনুশীলন কুইজ জেনারেটর" : "AI Practice Quiz Generator"}
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                    {isBn ? "আনলিমিটেড সুবিধা" : "Unlimited Access"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isBn
                    ? "বিষয়, অধ্যায়, কঠিনতার স্তর এবং সময়সীমা নির্বাচন করে নিমেষেই কুইজ তৈরি করুন।"
                    : "Select your subject, chapter, difficulty, and time limit to launch an instant timed test."}
                </p>
              </div>
            </div>
          </div>

          {/* Form Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Field 1: Subject / Assigned Book */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <BookOpen size={14} className="text-indigo-400" />
                <span>{isBn ? "পাঠ্যবই বা বিষয়" : "Subject / Curriculum Book"}</span>
              </label>
              {assignedTextbooks.length > 0 ? (
                <select
                  value={selectedSubject}
                  onChange={(e) => {
                    setSelectedSubject(e.target.value);
                    const b = assignedTextbooks.find((item) => item.subject === e.target.value || item.title === e.target.value);
                    setSelectedBook(b || null);
                  }}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 text-xs font-semibold text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 min-h-[42px]"
                >
                  {assignedTextbooks.map((b, idx) => (
                    <option key={b.id || idx} value={b.subject || b.title}>
                      {b.title || b.subject} {b.grade ? `(${b.grade})` : ""}
                    </option>
                  ))}
                  <option value="General Science">General Science / সাধারণ বিজ্ঞান</option>
                  <option value="Mathematics">Mathematics / গণিত</option>
                  <option value="English">English / ইংরেজি</option>
                </select>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_SUBJECTS.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => setSelectedSubject(s.name)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                        selectedSubject === s.name
                          ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/20"
                          : "bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                      }`}
                    >
                      {isBn ? s.bn : s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Field 2: Chapter / Topic */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <FileText size={14} className="text-indigo-400" />
                <span>{isBn ? "অধ্যায় বা সুনির্দিষ্ট বিষয়" : "Chapter or Specific Topic"}</span>
                <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                placeholder={
                  isBn
                    ? "যেমন: অধ্যায় ৩ - পদার্থের গঠন / আলোর প্রতিফলন"
                    : "e.g. Chapter 3 - Structure of Matter / Optics"
                }
                className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 text-xs font-semibold text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 min-h-[42px]"
                required
              />
            </div>

            {/* Field 3: Difficulty */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sliders size={14} className="text-indigo-400" />
                <span>{isBn ? "কঠিনতার স্তর" : "Difficulty"}</span>
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/80 border border-slate-800 rounded-2xl">
                {DIFFICULTY_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`py-1.5 text-center text-xs font-bold rounded-xl transition-all ${
                      difficulty === d
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {d === "Easy" ? (isBn ? "সহজ" : "Easy") : d === "Medium" ? (isBn ? "মাঝারি" : "Medium") : (isBn ? "কঠিন" : "Hard")}
                  </button>
                ))}
              </div>
            </div>

            {/* Field 4: Number of Questions */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-indigo-400" />
                <span>{isBn ? "প্রশ্ন সংখ্যা" : "Question Count"}</span>
              </label>
              <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950/80 border border-slate-800 rounded-2xl">
                {QUESTION_COUNT_OPTIONS.map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setQuestionCount(cnt)}
                    className={`py-1.5 text-center text-xs font-bold rounded-xl transition-all ${
                      questionCount === cnt
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>

            {/* Field 5: TIME LIMIT IN MINUTES (User Requested Spec: 5, 10, 15, 20, 30 min) */}
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock size={14} className="text-emerald-400" />
                  <span>{isBn ? "পরীক্ষার সময়সীমা (মিনিট)" : "Time Limit (Minutes)"}</span>
                </span>
                <span className="text-[11px] font-bold text-emerald-400">
                  {timeLimitMinutes} {isBn ? "মিনিট" : "Mins"}
                </span>
              </label>
              <div className="grid grid-cols-5 gap-1.5 p-1 bg-slate-950/80 border border-slate-800 rounded-2xl">
                {TIME_LIMIT_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTimeLimitMinutes(m)}
                    className={`py-2 text-center text-xs font-extrabold rounded-xl transition-all ${
                      timeLimitMinutes === m
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                        : "text-slate-400 hover:text-white hover:bg-slate-900"
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          {genError && (
            <div className="p-3 rounded-2xl bg-rose-950/40 border border-rose-800/50 text-xs font-medium text-rose-300 flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{genError}</span>
            </div>
          )}

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="text-[11px] text-slate-500">
              {isBn
                ? "প্রশ্ন ও সঠিক উত্তর পরীক্ষার পূর্বে সম্পূর্ণ গোপন রাখা হবে।"
                : "Questions and answer keys remain strictly concealed until exam completion."}
            </div>

            <button
              type="submit"
              disabled={isGenerating || !chapter.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-6 py-3 text-xs sm:text-sm font-black text-white shadow-xl shadow-emerald-600/25 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none min-h-[44px]"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  <span>
                    {isBn ? "এআই প্রশ্ন প্রস্তুত করছে..." : "Generating & Launching Quiz..."}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>
                    {isBn
                      ? `কুইজ তৈরি ও শুরু করুন (${questionCount}টি প্রশ্ন • ${timeLimitMinutes} মিনিট)`
                      : `Generate & Start Quiz (${questionCount} MCQs • ${timeLimitMinutes} Mins)`}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
