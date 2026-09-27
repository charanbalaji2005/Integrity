import React, { useState, useEffect } from "react";
import { 
  FileText, 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  Download, 
  History, 
  Sparkles, 
  Trash2, 
  RefreshCw, 
  Loader2,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { toast } from "sonner";

interface PlagiarismAnalysisProps {
  user: any;
}

interface MatchedChunk {
  chunk: number;
  similarity: number;
  reason: string;
  matchedText?: string;
}

interface AnalysisChunk {
  text: string;
  similarity: number;
}

interface PlagiarismResult {
  filename: string;
  overallSimilarity: number;
  risk: string;
  confidence: number;
  processingTime: string;
  totalWords: number;
  matchedWords: number;
  uniqueWords: number;
  matchedChunks: MatchedChunk[];
  chunks: AnalysisChunk[];
  aiExplanation: string;
  manualReview: boolean;
  generatedAt: string;
  extractedText: string;
}

type Stage = 
  | "idle"
  | "uploading"
  | "extracting"
  | "chunking"
  | "embeddings"
  | "similarity"
  | "explanation"
  | "completed"
  | "error";

export function PlagiarismAnalysis({ user }: PlagiarismAnalysisProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<PlagiarismResult | null>(null);
  const [history, setHistory] = useState<PlagiarismResult[]>([]);
  const [expandedChunks, setExpandedChunks] = useState<Record<number, boolean>>({});

  // Load history from localStorage
  useEffect(() => {
    const key = `plagiarism_history_${user.id}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
  }, [user.id]);

  // Save history to localStorage
  const saveToHistory = (newResult: PlagiarismResult) => {
    const key = `plagiarism_history_${user.id}`;
    const updated = [newResult, ...history.filter(h => h.filename !== newResult.filename || h.generatedAt !== newResult.generatedAt)].slice(0, 10);
    setHistory(updated);
    localStorage.setItem(key, JSON.stringify(updated));
  };

  const clearHistory = () => {
    const key = `plagiarism_history_${user.id}`;
    localStorage.removeItem(key);
    setHistory([]);
    toast.success("Analysis history cleared.");
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    const maxBytes = 10 * 1024 * 1024; // 10MB
    if (selectedFile.size > maxBytes) {
      toast.error("File size exceeds the 10MB limit.");
      return;
    }

    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    const validExtensions = ["txt", "pdf", "docx", "png", "jpg", "jpeg", "webp"];
    
    if (!validExtensions.includes(ext || "")) {
      toast.error("Unsupported file format. Please upload TXT, PDF, DOCX, or images.");
      return;
    }

    setFile(selectedFile);
    setResult(null);
    setStage("idle");
  };

  const startAnalysis = async () => {
    if (!file) return;

    setStage("uploading");
    const formData = new FormData();
    formData.append("document", file);

    try {
      // Simulate frontend loading intervals for smooth UI visual stages
      setTimeout(() => setStage("extracting"), 800);
      setTimeout(() => setStage("chunking"), 1600);
      setTimeout(() => setStage("embeddings"), 2400);
      setTimeout(() => setStage("similarity"), 3200);
      setTimeout(() => setStage("explanation"), 4000);

      const res = await fetch("/api/plagiarism/analyze-document", {
        method: "POST",
        headers: {
          "x-user-id": user.id,
          "x-user-role": user.role
        },
        body: formData
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStage("completed");
        setResult(data.data);
        saveToHistory(data.data);
        toast.success("Document Plagiarism analysis completed successfully!");
      } else {
        setStage("error");
        toast.error(data.message || "Failed to analyze document plagiarism.");
      }
    } catch (err) {
      setStage("error");
      toast.error("An error occurred during analysis.");
    }
  };

  const resetAnalyzer = () => {
    setFile(null);
    setResult(null);
    setStage("idle");
  };

  const toggleChunkExpand = (chunkIdx: number) => {
    setExpandedChunks(prev => ({
      ...prev,
      [chunkIdx]: !prev[chunkIdx]
    }));
  };

  const downloadJSONReport = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `plagiarism_report_${result.filename.replace(/\.[^/.]+$/, "")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printPDFReport = () => {
    window.print();
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "Very High": return "text-red-600 bg-red-50 border-red-200";
      case "High": return "text-amber-600 bg-amber-50 border-amber-200";
      case "Moderate": return "text-yellow-600 bg-yellow-50 border-yellow-200";
      default: return "text-emerald-600 bg-emerald-50 border-emerald-200";
    }
  };

  const getChunkHighlightClass = (similarity: number) => {
    if (similarity >= 85) return "bg-red-100 text-red-950 border-b border-red-300 px-1 rounded-sm";
    if (similarity >= 70) return "bg-amber-100 text-amber-950 border-b border-amber-300 px-1 rounded-sm";
    if (similarity >= 50) return "bg-yellow-50 text-yellow-950 border-b border-yellow-200 px-1 rounded-sm";
    return "";
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex justify-between items-center">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight text-[#1a1917]">Text Plagiarism Analysis</h2>
          <p className="text-xs text-[#8e8a80]">Upload documents to run semantic similarity checks against submissions and institutional databases.</p>
        </div>
        {history.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold cursor-pointer transition-colors"
          >
            <Trash2 className="size-3.5" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* Main Analyzer Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Upload Panel & Loading States */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)]">
            <h3 className="text-sm font-bold text-[#1a1917] mb-3">Upload Assignment Document</h3>
            
            {stage === "idle" && (
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  dragActive ? "border-[#c5af8a] bg-[#FAF6EE]/50" : "border-[#ebdcc9] hover:bg-[#FAF6EE]/20"
                }`}
              >
                <input
                  type="file"
                  id="plagiarism-file-input"
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".txt,.pdf,.docx,image/*"
                />
                <label htmlFor="plagiarism-file-input" className="cursor-pointer space-y-3 block">
                  <div className="size-10 bg-[#FAF6EE] rounded-full flex items-center justify-center mx-auto border border-[#ebdcc9]/50">
                    <FileText className="size-5 text-[#c5af8a]" />
                  </div>
                  <div className="text-xs font-bold text-zinc-700">
                    Drag & drop or <span className="text-[#c5af8a] underline">browse files</span>
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    Supported formats: PDF, DOCX, TXT, PNG, JPG (Max 10MB)
                  </div>
                </label>
              </div>
            )}

            {/* File Selected State */}
            {file && stage === "idle" && (
              <div className="p-4 rounded-xl bg-[#FAF6EE]/55 border border-[#ebdcc9]/40 space-y-4">
                <div className="flex items-center gap-3">
                  <FileText className="size-8 text-[#c5af8a] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-zinc-800 truncate">{file.name}</p>
                    <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setFile(null)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={startAnalysis}
                  className="w-full bg-[#1a1917] text-white hover:bg-black py-2.5 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Search className="size-4" />
                  <span>Start Plagiarism Analysis</span>
                </button>
              </div>
            )}

            {/* Analysis Loading State */}
            {stage !== "idle" && stage !== "completed" && stage !== "error" && (
              <div className="p-4 space-y-6 text-center">
                <div className="relative size-16 mx-auto flex items-center justify-center">
                  <Loader2 className="size-10 text-[#c5af8a] animate-spin" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-[#1a1917] capitalize">
                    {stage === "uploading" && "Uploading document..."}
                    {stage === "extracting" && "Extracting text..."}
                    {stage === "chunking" && "Generating semantic chunks..."}
                    {stage === "embeddings" && "Generating text embeddings..."}
                    {stage === "similarity" && "Calculating cosine similarity..."}
                    {stage === "explanation" && "Generating AI plagiarism review..."}
                  </h4>
                  <div className="w-full bg-[#FAF6EE] h-1.5 rounded-full overflow-hidden border border-[#ebdcc9]/25">
                    <div 
                      className="bg-[#c5af8a] h-full rounded-full transition-all duration-500" 
                      style={{ 
                        width: 
                          stage === "uploading" ? "15%" :
                          stage === "extracting" ? "35%" :
                          stage === "chunking" ? "55%" :
                          stage === "embeddings" ? "70%" :
                          stage === "similarity" ? "85%" : "95%"
                      }} 
                    />
                  </div>
                  <ul className="text-[10px] text-zinc-450 space-y-1 text-left list-none pl-0">
                    <li className="flex items-center gap-1.5">
                      <span className={stage !== "uploading" ? "text-emerald-500" : "text-zinc-400"}>✓</span> Upload file
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className={!["uploading", "extracting"].includes(stage) ? "text-emerald-500" : "text-zinc-400"}>✓</span> Text extraction
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className={!["uploading", "extracting", "chunking"].includes(stage) ? "text-emerald-500" : "text-zinc-400"}>✓</span> Chunk generation
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className={!["uploading", "extracting", "chunking", "embeddings"].includes(stage) ? "text-emerald-500" : "text-zinc-400"}>✓</span> Cosine similarity check
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* Error state */}
            {stage === "error" && (
              <div className="p-4 text-center space-y-4">
                <AlertTriangle className="size-10 text-rose-500 mx-auto" />
                <div>
                  <h4 className="text-xs font-bold text-rose-600">Analysis Failed</h4>
                  <p className="text-[11px] text-zinc-400 mt-1">An error occurred during plagiarism analysis. Please retry.</p>
                </div>
                <button
                  type="button"
                  onClick={resetAnalyzer}
                  className="w-full bg-[#1a1917] text-white hover:bg-black py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  Reset Analyzer
                </button>
              </div>
            )}

            {/* Completed state summary */}
            {stage === "completed" && result && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-4 text-center">
                <CheckCircle className="size-10 text-emerald-500 mx-auto" />
                <div>
                  <h4 className="text-xs font-bold text-emerald-800">Analysis Completed</h4>
                  <p className="text-[11px] text-emerald-600 mt-1">Plagiarism report has been calculated.</p>
                </div>
                <button
                  type="button"
                  onClick={resetAnalyzer}
                  className="w-full bg-white hover:bg-zinc-50 border border-emerald-200 text-zinc-700 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="size-3.5" />
                  <span>Analyze Another Document</span>
                </button>
              </div>
            )}
          </div>

          {/* Analysis History Widget */}
          <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#1a1917] flex items-center gap-1.5">
                <History className="size-4.5 text-[#c5af8a]" />
                <span>Recent Analyses</span>
              </h3>
            </div>
            <div className="space-y-3">
              {history.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#8e8a80] border border-dashed rounded-xl">
                  No historical reports available.
                </div>
              ) : (
                history.map((hist, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setResult(hist);
                      setFile(new File([], hist.filename));
                      setStage("completed");
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-[#FAF6EE]/55 border border-[#ebdcc9]/40 hover:bg-[#FAF6EE] transition cursor-pointer text-left"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <span className="text-xs font-bold text-zinc-800 block truncate">{hist.filename}</span>
                      <span className="text-[10px] text-[#8e8a80] block mt-0.5">{new Date(hist.generatedAt).toLocaleDateString()}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-extrabold text-[#1a1917] block">{hist.overallSimilarity}%</span>
                      <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full border mt-1 ${getRiskColor(hist.risk)}`}>
                        {hist.risk}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Results Details Display Area */}
        <div className="lg:col-span-2 space-y-6">
          {result ? (
            <div className="space-y-6">
              
              {/* Plagiarism Similarity KPI Header */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                
                {/* Metric Card 1: Score */}
                <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)] flex flex-col items-center justify-center text-center">
                  <span className="text-[11px] font-bold text-[#8e8a80] uppercase tracking-wider">Overall Similarity</span>
                  <div className="relative size-24 flex items-center justify-center mt-3">
                    <svg className="size-full transform -rotate-90">
                      <circle cx="48" cy="48" r="40" stroke="#FAF6EE" strokeWidth="8" fill="transparent" />
                      <circle 
                        cx="48" 
                        cy="48" 
                        r="40" 
                        stroke={result.overallSimilarity > 60 ? "#dc2626" : result.overallSimilarity > 30 ? "#d97706" : result.overallSimilarity > 10 ? "#eab308" : "#10b981"} 
                        strokeWidth="8" 
                        fill="transparent" 
                        strokeDasharray={2 * Math.PI * 40}
                        strokeDashoffset={2 * Math.PI * 40 * (1 - result.overallSimilarity / 100)}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute text-xl font-extrabold text-zinc-900">{result.overallSimilarity}%</span>
                  </div>
                </div>

                {/* Metric Card 2: Risk Badge */}
                <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)] flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-[#8e8a80] uppercase tracking-wider block">Risk Assessment</span>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold mt-4 uppercase tracking-wide ${getRiskColor(result.risk)}`}>
                      <AlertTriangle className="size-4" />
                      <span>{result.risk} Risk</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-450 mt-2 font-medium">Plagiarism risk level derived from overall semantic overlapping metrics.</p>
                </div>

                {/* Metric Card 3: Summary Stats */}
                <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)] flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-[#8e8a80] uppercase tracking-wider">Analysis Summary</span>
                    <table className="w-full mt-3 text-xs">
                      <tbody>
                        <tr className="border-b border-zinc-100 pb-1 flex justify-between">
                          <td className="text-zinc-500 font-medium">Total Words</td>
                          <td className="font-bold text-zinc-800">{result.totalWords}</td>
                        </tr>
                        <tr className="border-b border-zinc-100 py-1 flex justify-between">
                          <td className="text-zinc-500 font-medium">Matched Words</td>
                          <td className="font-bold text-rose-600">{result.matchedWords}</td>
                        </tr>
                        <tr className="py-1 flex justify-between">
                          <td className="text-zinc-500 font-medium">Processing Time</td>
                          <td className="font-bold text-zinc-800">{result.processingTime}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      type="button"
                      onClick={downloadJSONReport}
                      className="flex-1 py-1.5 border border-zinc-200 hover:bg-[#FAF6EE] text-[11px] font-bold rounded-xl transition cursor-pointer text-zinc-700 flex items-center justify-center gap-1"
                    >
                      <Download className="size-3.5" />
                      <span>JSON</span>
                    </button>
                    <button
                      type="button"
                      onClick={printPDFReport}
                      className="flex-1 py-1.5 bg-[#1a1917] hover:bg-black text-white text-[11px] font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Download className="size-3.5" />
                      <span>PDF</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* AI Explanation Card */}
              <div className="bg-[#FAF6EE] border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,0,0,0.01)] space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4.5 text-[#c5af8a]" />
                  <h4 className="text-sm font-bold text-[#1a1917]">Llama AI Plagiarism Review</h4>
                </div>
                <p className="text-[13px] leading-relaxed text-zinc-700 font-normal">
                  {result.aiExplanation}
                </p>
                <div className="pt-3 border-t border-[#ebdcc9]/40 flex justify-between items-center text-[11px] text-zinc-500">
                  <span>Model: llama3.2:3b</span>
                  <span className={`font-bold px-2 py-0.5 rounded border ${result.manualReview ? "text-rose-600 bg-rose-50 border-rose-100" : "text-emerald-600 bg-emerald-50 border-emerald-100"}`}>
                    {result.manualReview ? "Manual Review Recommended" : "Manual Review Not Required"}
                  </span>
                </div>
              </div>

              {/* Highlighted Document Viewer */}
              <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)] space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-[#1a1917]">Extracted Document Text Viewer</h3>
                  <div className="flex gap-4 text-[10px] font-semibold text-zinc-500">
                    <span className="flex items-center gap-1"><span className="size-2.5 rounded bg-red-100 border border-red-350" /> High (&gt;85%)</span>
                    <span className="flex items-center gap-1"><span className="size-2.5 rounded bg-amber-100 border border-amber-350" /> Med (70-85%)</span>
                    <span className="flex items-center gap-1"><span className="size-2.5 rounded bg-yellow-50 border border-yellow-250" /> Low (50-70%)</span>
                  </div>
                </div>

                {/* Highlighted text block */}
                <div className="max-h-72 overflow-y-auto p-4 bg-[#FAF6EE]/20 border border-[#ebdcc9]/40 rounded-xl text-xs leading-relaxed font-normal text-zinc-800 space-y-2 whitespace-pre-line">
                  {result.chunks && result.chunks.length > 0 ? (
                    result.chunks.map((ch, idx) => (
                      <span key={idx} className={getChunkHighlightClass(ch.similarity)}>
                        {ch.text}{" "}
                      </span>
                    ))
                  ) : (
                    <span>{result.extractedText}</span>
                  )}
                </div>
              </div>

              {/* Matched Chunks Table */}
              <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)]">
                <h3 className="text-sm font-bold text-[#1a1917] mb-3">Matched Chunks Details ({result.matchedChunks.length})</h3>
                
                {result.matchedChunks.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[#8e8a80] border border-dashed rounded-xl">
                    No matching chunks with similarity index above 50% found.
                  </div>
                ) : (
                  <div className="overflow-hidden border border-[#ebdcc9]/40 rounded-xl">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-[#FAF6EE]/50 border-b border-[#ebdcc9]/40">
                          <th className="p-3 font-bold text-zinc-700">Chunk</th>
                          <th className="p-3 font-bold text-zinc-700">Similarity</th>
                          <th className="p-3 font-bold text-zinc-700">Matching Risk</th>
                          <th className="p-3 font-bold text-zinc-700 text-right">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-150">
                        {result.matchedChunks.map((chunk) => {
                          const isExpanded = !!expandedChunks[chunk.chunk];
                          return (
                            <React.Fragment key={chunk.chunk}>
                              <tr className="hover:bg-[#FAF6EE]/15">
                                <td className="p-3 font-bold text-zinc-800">Chunk #{chunk.chunk}</td>
                                <td className="p-3 font-extrabold text-[#1a1917]">{chunk.similarity}%</td>
                                <td className="p-3">
                                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                    chunk.similarity >= 85 
                                      ? "bg-red-50 border-red-150 text-red-600" 
                                      : chunk.similarity >= 70 
                                      ? "bg-amber-50 border-amber-150 text-amber-600" 
                                      : "bg-yellow-50 border-yellow-150 text-yellow-600"
                                  }`}>
                                    {chunk.reason}
                                  </span>
                                </td>
                                <td className="p-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => toggleChunkExpand(chunk.chunk)}
                                    className="p-1 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 cursor-pointer"
                                  >
                                    {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                                  </button>
                                </td>
                              </tr>
                              {isExpanded && chunk.matchedText && (
                                <tr className="bg-[#FAF6EE]/20">
                                  <td colSpan={4} className="p-3 border-t border-zinc-100 text-[11px] text-zinc-650 leading-relaxed font-normal pl-8 italic">
                                    <span className="font-bold text-zinc-800 block not-italic mb-1">Matched Semantic Concept Source:</span>
                                    "{chunk.matchedText}"
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="bg-white border border-[#ebdcc9] rounded-2xl p-16 text-center text-sm text-[#8e8a80] shadow-sm flex flex-col items-center justify-center gap-3">
              <div className="size-12 bg-[#FAF6EE] rounded-full flex items-center justify-center border border-[#ebdcc9]/50 text-[#c5af8a]">
                <FileText className="size-6" />
              </div>
              <h3 className="font-bold text-[#1a1917] mt-2">No Plagiarism Report Selected</h3>
              <p className="max-w-xs text-xs text-[#8e8a80] leading-relaxed">Select a report from your recent history or upload a new assignment document to calculate plagiarism metrics.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
