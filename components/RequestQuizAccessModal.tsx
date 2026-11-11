"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Send,
  Loader2,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  ShieldAlert,
  Info,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface RequestQuizAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  classroomId?: string;
  classroomName?: string;
  user: {
    id: string;
    name: string;
    email: string;
    uniqueId?: string | null;
  } | null;
  onRequestSubmitted?: () => void;
}

export default function RequestQuizAccessModal({
  isOpen,
  onClose,
  classroomId,
  classroomName,
  user,
  onRequestSubmitted,
}: RequestQuizAccessModalProps) {
  const { language } = useLanguage();

  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [requestStatus, setRequestStatus] = useState<any | null>(null);
  const [globalFeatureEnabled, setGlobalFeatureEnabled] = useState(true);
  const [showReapplyForm, setShowReapplyForm] = useState(false);

  // Fetch student's current request status when opening modal
  useEffect(() => {
    if (!isOpen || !user?.id) return;

    let isMounted = true;
    const fetchStatus = async () => {
      try {
        setIsLoadingStatus(true);
        setError("");
        const res = await fetch("/api/quiz-requests", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setRequestStatus(data.latestRequest || null);
            setGlobalFeatureEnabled(data.globalFeatureEnabled ?? true);
            if (data.latestRequest && data.latestRequest.status !== "PENDING") {
              setShowReapplyForm(false);
            }
          }
        }
      } catch (err) {
        console.error("Error loading quiz request status:", err);
      } finally {
        if (isMounted) setIsLoadingStatus(false);
      }
    };

    fetchStatus();
    return () => {
      isMounted = false;
    };
  }, [isOpen, user?.id]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || message.trim().length < 10) {
      setError(
        language === "bn"
          ? "দয়া করে অন্তত ১০ অক্ষরের একটি স্পষ্ট বার্তা লিখুন।"
          : "Please enter a message with at least 10 characters."
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");
      setSuccessMsg("");

      const res = await fetch("/api/quiz-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          classroomId: classroomId || null,
          classroomName: classroomName || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit request.");
      }

      setSuccessMsg(
        language === "bn"
          ? "আপনার আবেদন সফলভাবে প্রশাসকের কাছে পাঠানো হয়েছে।"
          : "Your request has been submitted to the admin for review."
      );
      setRequestStatus(data.request);
      setShowReapplyForm(false);
      setMessage("");

      if (onRequestSubmitted) {
        onRequestSubmitted();
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPending = requestStatus?.status === "PENDING";
  const isApproved = requestStatus?.status === "APPROVED";
  const isRejectedOrRevoked =
    requestStatus?.status === "REJECTED" || requestStatus?.status === "REVOKED";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden my-auto transition-all">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800/80 bg-gradient-to-r from-indigo-50/50 via-purple-50/30 to-white dark:from-indigo-950/20 dark:via-purple-950/10 dark:to-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20 shrink-0">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                {language === "bn"
                  ? "কুইজ তৈরির অনুমতির আবেদন"
                  : "Request Quiz Generation Access"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {classroomName ? classroomName : "Self-Assessment & Practice"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Global Disabled Notice */}
          {!globalFeatureEnabled && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start gap-3">
              <ShieldAlert className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={18} />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  {language === "bn" ? "ফিচারটি সাময়িকভাবে বন্ধ আছে" : "Feature Temporarily Disabled"}
                </h4>
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  {language === "bn"
                    ? "সিস্টেম অ্যাডমিন কর্তৃক শিক্ষার্থীদের কুইজ তৈরির সুবিধা সাময়িকভাবে বন্ধ রাখা হয়েছে।"
                    : "Student quiz generation is currently turned off system-wide by the administration."}
                </p>
              </div>
            </div>
          )}

          {/* Student Profile Info Pill */}
          {user && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">
                  {user.name}
                </span>
                <span className="text-slate-500 dark:text-slate-400 block font-mono text-[11px]">
                  {user.email}
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-full font-mono font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800">
                {user.uniqueId || "Student"}
              </span>
            </div>
          )}

          {/* Status Loading Skeleton */}
          {isLoadingStatus && (
            <div className="p-8 text-center space-y-2">
              <Loader2 className="animate-spin h-6 w-6 text-indigo-600 mx-auto" />
              <p className="text-xs text-slate-400">
                {language === "bn" ? "আবেদনের তথ্য লোড হচ্ছে..." : "Checking application status..."}
              </p>
            </div>
          )}

          {/* VIEW: CURRENT STATUS NOTIFICATIONS */}
          {!isLoadingStatus && requestStatus && !showReapplyForm && (
            <div className="space-y-4">
              {/* Status Banner */}
              <div
                className={`p-4 rounded-2xl border flex items-start gap-3 ${
                  isPending
                    ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200"
                    : isApproved
                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-200"
                    : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-900 dark:text-rose-200"
                }`}
              >
                {isPending ? (
                  <Clock className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={20} />
                ) : isApproved ? (
                  <CheckCircle2 className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" size={20} />
                ) : (
                  <AlertCircle className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" size={20} />
                )}

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-bold">
                      {isPending
                        ? language === "bn"
                          ? "আবেদন পর্যালোচনায় রয়েছে (Pending)"
                          : "Application Under Review"
                        : isApproved
                        ? language === "bn"
                          ? "অনুমোদন সম্পন্ন হয়েছে (Approved)"
                          : "Access Approved"
                        : requestStatus?.status === "REVOKED"
                        ? language === "bn"
                          ? "অনুমতি বাতিল করা হয়েছে (Revoked)"
                          : "Access Revoked by Admin"
                        : language === "bn"
                        ? "আবেদন নাকচ করা হয়েছে (Rejected)"
                        : "Application Rejected"}
                    </h4>
                  </div>
                  <p className="text-xs opacity-90 leading-relaxed">
                    {isPending
                      ? language === "bn"
                        ? "আপনার আবেদনটি অ্যাডমিনের ইনবক্সে রয়েছে। অনুমোদনের পর আপনি সরাসরি কুইজ জেনারেট করতে পারবেন।"
                        : "Your request is in the admin inbox. Once approved, you can immediately generate practice quizzes."
                      : isApproved
                      ? language === "bn"
                        ? "অভিনন্দন! আপনি এখন বোর্ড বই থেকে অনুশীলনী কুইজ তৈরি ও পরীক্ষা দিতে পারবেন।"
                        : "Congratulations! You can now generate curriculum-based practice quizzes."
                      : language === "bn"
                      ? "প্রশাসক কর্তৃক এই আবেদনটি বাতিল করা হয়েছিল। প্রয়োজনে নতুন বার্তা লিখে আবার আবেদন করতে পারেন।"
                      : "The administrator declined or revoked this permission. You may submit a new request if needed."}
                  </p>
                </div>
              </div>

              {/* Submitted message preview */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px] block">
                  {language === "bn" ? "আপনার প্রেরিত বার্তা:" : "Your Submitted Message:"}
                </span>
                <p className="text-slate-700 dark:text-slate-200 italic leading-relaxed whitespace-pre-wrap">
                  "{requestStatus.message}"
                </p>
                {requestStatus.adminNote && (
                  <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-700/60 text-rose-600 dark:text-rose-400">
                    <span className="font-bold block text-[10px] uppercase">Admin Feedback:</span>
                    <span>{requestStatus.adminNote}</span>
                  </div>
                )}
              </div>

              {/* Re-apply button for rejected/revoked */}
              {isRejectedOrRevoked && globalFeatureEnabled && (
                <button
                  type="button"
                  onClick={() => setShowReapplyForm(true)}
                  className="w-full py-2.5 px-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold text-xs hover:bg-indigo-100 transition-colors"
                >
                  {language === "bn" ? "নতুন করে আবেদন করুন" : "Submit a New Request"}
                </button>
              )}
            </div>
          )}

          {/* VIEW: REQUEST SUBMISSION FORM */}
          {(!requestStatus || showReapplyForm) && !isLoadingStatus && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {language === "bn"
                      ? "প্রশাসকের কাছে বার্তা (কারণ লিখুন)"
                      : "Message to Admin (State Your Reason)"}
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {message.length} chars (min 10)
                  </span>
                </div>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={isSubmitting || !globalFeatureEnabled}
                  rows={4}
                  placeholder={
                    language === "bn"
                      ? "কুইজ তৈরির অনুমতি চাওয়ার কারণ ও পড়ালেখার লক্ষ্য লিখুন (যেমন: বোর্ড পরীক্ষার প্রস্তুতি, নির্দিষ্ট অধ্যায়ের স্ব-মূল্যায়ন)..."
                      : "Explain why you want to create quizzes (e.g. self-assessment on Physics Chapter 3, preparing for upcoming exams)..."
                  }
                  className="w-full p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all placeholder:text-slate-400 leading-relaxed resize-none"
                />
              </div>

              {/* How it works info badge */}
              <div className="p-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 flex items-start gap-2.5 text-xs text-indigo-950 dark:text-indigo-200">
                <Info size={16} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed text-[11px]">
                  {language === "bn"
                    ? "অনুমোদনের পর আপনি শিক্ষকের মতোই অধ্যায় ও প্রশ্নের সংখ্যা নির্ধারণ করে কুইজ তৈরি করতে পারবেন। নিরপেক্ষ মূল্যায়নের জন্য প্রশ্ন ও উত্তরগুলো টেস্ট শুরু করার আগে গোপন রাখা হবে।"
                    : "Once approved, you can generate quizzes just like teachers from textbooks. To ensure honest assessment, questions and answers are kept secret until your test begins."}
                </p>
              </div>

              {/* Error / Success Alerts */}
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 size={15} className="shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {language === "bn" ? "বাতিল" : "Cancel"}
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || message.trim().length < 10 || !globalFeatureEnabled}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-indigo-600/20 active:scale-95 transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>{language === "bn" ? "পাঠানো হচ্ছে..." : "Submitting..."}</span>
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      <span>{language === "bn" ? "আবেদন পাঠান" : "Submit Request"}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
