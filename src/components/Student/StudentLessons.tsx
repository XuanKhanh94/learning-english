import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { BookOpen, Video, FileText, Calendar, Clock, ExternalLink, Download } from 'lucide-react';
import { SkeletonList } from '../Skeletons';

interface Lesson {
    id: string;
    title: string;
    description: string;
    content: string;
    type: 'text' | 'youtube' | 'document';
    file_url?: string;
    file_name?: string;
    youtube_url?: string;
    youtube_id?: string;
    created_at: unknown;
    updated_at: unknown;
    teacher_id: string;
    is_published: boolean;
}

export function StudentLessons() {
    const { profile } = useAuth();
    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchLessons = useCallback(async () => {
        try {
            const q = query(
                collection(db, 'lessons'),
                where('is_published', '==', true)
            );
            const querySnapshot = await getDocs(q);

            const lessonsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Lesson[];

            // Sort in JavaScript instead of Firestore
            lessonsData.sort((a, b) => {
                const dateA = toDate(a.created_at);
                const dateB = toDate(b.created_at);
                return dateB.getTime() - dateA.getTime();
            });

            setLessons(lessonsData);
        } catch (error) {
            console.error('Error fetching lessons:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLessons();
    }, [fetchLessons]);

    const handleDownload = async (fileUrl: string, fileName: string) => {
        try {
            const response = await fetch(fileUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Error downloading file:', error);
        }
    };

    const toDate = (ts: unknown): Date => {
        if (!ts) return new Date(0);
        try {
            if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
                return new Date((ts as { seconds: number }).seconds * 1000);
            }
            if (typeof ts === 'number') {
                return new Date(ts * 1000);
            }
            if (typeof ts === 'string') {
                return new Date(ts);
            }
            return new Date(0);
        } catch {
            return new Date(0);
        }
    };

    if (loading) {
        return (
            <div className="bg-gray-100 p-6">
                <SkeletonList count={6} />
            </div>
        );
    }

    return (
        <>
            <div className="bg-gradient-to-br from-blue-50 to-indigo-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {/* Header Section */}
                    <div className="mb-8">
                        <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-100 rounded-xl">
                                    <BookOpen className="w-8 h-8 text-blue-600" />
                                </div>
                                <div>
                                    <h1 className="text-3xl font-bold text-gray-900">Bài giảng</h1>
                                    <p className="text-gray-600 mt-1">Xem và học từ các bài giảng của giáo viên</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {lessons.length === 0 ? (
                        <div className="bg-white rounded-2xl shadow-lg p-12 text-center border border-gray-200">
                            <div className="p-4 bg-gray-100 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                                <BookOpen className="w-10 h-10 text-gray-400" />
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">Chưa có bài giảng nào</h3>
                            <p className="text-gray-600 mb-6">
                                Giáo viên chưa tạo bài giảng nào. Hãy quay lại sau!
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-6">
                            {lessons.map((lesson) => (
                                <div key={lesson.id} className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                {lesson.type === 'youtube' ? (
                                                    <Video className="w-5 h-5 text-red-500" />
                                                ) : lesson.type === 'document' ? (
                                                    <FileText className="w-5 h-5 text-blue-500" />
                                                ) : (
                                                    <BookOpen className="w-5 h-5 text-green-500" />
                                                )}
                                                <h3 className="text-lg font-semibold text-gray-900">
                                                    {lesson.title}
                                                </h3>
                                            </div>

                                            {lesson.description && (
                                                <p className="text-gray-700 mb-4">
                                                    {lesson.description}
                                                </p>
                                            )}

                                            <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-4 h-4" />
                                                    Tạo: {toDate(lesson.created_at).toLocaleDateString('vi-VN')}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-4 h-4" />
                                                    Cập nhật: {toDate(lesson.updated_at).toLocaleDateString('vi-VN')}
                                                </span>
                                            </div>

                                            {lesson.type === 'text' && lesson.content && (
                                                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                                                    <div className="prose prose-sm max-w-none">
                                                        <p className="text-gray-700 whitespace-pre-wrap">
                                                            {lesson.content}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {lesson.type === 'youtube' && lesson.youtube_id && (
                                                <div className="mb-4">
                                                    <div className="relative w-full max-w-2xl">
                                                        <iframe
                                                            width="100%"
                                                            height="315"
                                                            src={`https://www.youtube.com/embed/${lesson.youtube_id}`}
                                                            title={lesson.title}
                                                            frameBorder="0"
                                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                            allowFullScreen
                                                            className="rounded-lg shadow-md"
                                                        ></iframe>
                                                    </div>
                                                </div>
                                            )}

                                            {lesson.type === 'document' && lesson.file_url && (
                                                <div className="mb-4">
                                                    <button
                                                        onClick={() => handleDownload(lesson.file_url!, lesson.file_name!)}
                                                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                        Tải xuống: {lesson.file_name}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
