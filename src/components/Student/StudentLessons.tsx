import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { BookOpen, Video, FileText, Calendar, Clock, ExternalLink, Download, User, Eye } from 'lucide-react';
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
    teacher_name?: string;
}

export function StudentLessons() {
    const { profile } = useAuth();
    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [loading, setLoading] = useState(true);
    const [showViewModal, setShowViewModal] = useState(false);
    const [viewingLesson, setViewingLesson] = useState<Lesson | null>(null);

    const fetchLessons = useCallback(async () => {
        try {
            const q = query(
                collection(db, 'lessons'),
                where('is_published', '==', true)
            );
            const querySnapshot = await getDocs(q);

            let lessonsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Lesson[];

            // Lấy thông tin tên giáo viên cho mỗi bài giảng
            const lessonsWithTeacherNames = await Promise.all(
                lessonsData.map(async (lesson) => {
                    try {
                        const teacherDoc = await getDoc(doc(db, 'profiles', lesson.teacher_id));
                        if (teacherDoc.exists()) {
                            const teacherData = teacherDoc.data();
                            return {
                                ...lesson,
                                teacher_name: teacherData.full_name || teacherData.email || 'Giáo viên'
                            };
                        }
                        return {
                            ...lesson,
                            teacher_name: 'Giáo viên'
                        };
                    } catch (error) {
                        console.error('Error fetching teacher name:', error);
                        return {
                            ...lesson,
                            teacher_name: 'Giáo viên'
                        };
                    }
                })
            );

            // Sort in JavaScript instead of Firestore
            lessonsWithTeacherNames.sort((a, b) => {
                const dateA = toDate(a.created_at);
                const dateB = toDate(b.created_at);
                return dateB.getTime() - dateA.getTime();
            });

            setLessons(lessonsWithTeacherNames);
        } catch (error) {
            console.error('Error fetching lessons:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLessons();
    }, [fetchLessons]);

    const handleViewLesson = (lesson: Lesson) => {
        setViewingLesson(lesson);
        setShowViewModal(true);
    };

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
            <div className="modern-bg-primary min-h-screen">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {/* Header Section */}
                    <div className="mb-6 sm:mb-8">
                        <div className="modern-card p-6 sm:p-8 modern-animate-fade-in-up">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div className="flex items-center gap-3 sm:gap-4">
                                    <div className="p-3 sm:p-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg">
                                        <BookOpen className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                                    </div>
                                    <div>
                                        <h1 className="modern-heading-2">Bài giảng</h1>
                                        <p className="modern-text-muted mt-2">Xem và học từ các bài giảng của giáo viên</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {lessons.length === 0 ? (
                        <div className="modern-card p-12 text-center modern-animate-fade-in-up">
                            <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-full w-24 h-24 mx-auto mb-8 flex items-center justify-center">
                                <BookOpen className="w-12 h-12 text-blue-500" />
                            </div>
                            <h3 className="modern-heading-2 mb-4">Chưa có bài giảng nào</h3>
                            <p className="modern-text-body text-gray-600 mb-8 max-w-md mx-auto">
                                Giáo viên chưa tạo bài giảng nào. Hãy quay lại sau!
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {lessons.map((lesson) => (
                                <div key={lesson.id} className="modern-card lesson-card modern-animate-fade-in-scale lesson-card-hover group cursor-pointer" onClick={() => handleViewLesson(lesson)}>
                                    <div className="lesson-card-content">
                                        {/* Video/Media Section - Moved to top */}
                                        {lesson.type === 'youtube' && lesson.youtube_id && (
                                            <div className="relative w-full h-44 bg-gray-100 rounded-lg overflow-hidden mb-2">
                                                <iframe
                                                    width="100%"
                                                    height="100%"
                                                    src={`https://www.youtube.com/embed/${lesson.youtube_id}`}
                                                    title={lesson.title}
                                                    frameBorder="0"
                                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                    allowFullScreen
                                                    className="rounded-lg"
                                                ></iframe>
                                            </div>
                                        )}

                                        {/* Header Section */}
                                        <div className="lesson-card-header">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="flex-shrink-0 p-1.5 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100">
                                                    {lesson.type === 'youtube' ? (
                                                        <Video className="w-4 h-4 text-red-500" />
                                                    ) : lesson.type === 'document' ? (
                                                        <FileText className="w-4 h-4 text-blue-500" />
                                                    ) : (
                                                        <BookOpen className="w-4 h-4 text-green-500" />
                                                    )}
                                                </div>
                                                <span className="lesson-type-badge text-xs px-2 py-1 rounded-full">
                                                    {lesson.type === 'youtube' ? 'Video' : lesson.type === 'document' ? 'Tài liệu' : 'Văn bản'}
                                                </span>
                                            </div>
                                            <h3 className="text-base font-semibold text-gray-900 truncate leading-tight mb-2">
                                                {lesson.title}
                                            </h3>
                                        </div>

                                        {/* Body Section */}
                                        <div className="lesson-card-body">
                                            <div className="flex-1">
                                                {lesson.description && (
                                                    <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed mb-1">
                                                        {lesson.description}
                                                    </p>
                                                )}

                                                {/* Preview Content */}
                                                {lesson.type === 'text' && lesson.content && (
                                                    <div className="lesson-preview-content mb-1">
                                                        <p className="text-xs text-gray-700 line-clamp-2 leading-relaxed">
                                                            {lesson.content}
                                                        </p>
                                                    </div>
                                                )}

                                                {lesson.type === 'document' && lesson.file_url && (
                                                    <div className="flex items-center gap-2 px-2 py-1 text-xs text-blue-600 bg-blue-50 rounded-md mb-1">
                                                        <Download className="w-3 h-3" />
                                                        <span className="truncate">{lesson.file_name}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Metadata */}
                                            <div className="text-xs text-gray-500 space-y-1 mt-2">
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    <span>{toDate(lesson.created_at).toLocaleDateString('vi-VN')}</span>
                                                </div>
                                                {lesson.teacher_name && (
                                                    <div className="flex items-center gap-1">
                                                        <User className="w-3 h-3" />
                                                        <span className="truncate">{lesson.teacher_name}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Footer Section */}
                                        <div className="lesson-card-footer">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="modern-badge modern-badge-primary">
                                                        <Eye className="w-3 h-3" />
                                                        Xem bài giảng
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* View Lesson Modal */}
            {showViewModal && viewingLesson && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4" style={{ position: 'fixed' }}>
                    <div className="modern-card-elevated lesson-view-modal modern-animate-fade-in-scale">
                        <div className="lesson-view-modal-content">
                            {/* Modal Header */}
                            <div className="lesson-view-modal-header">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-white/20 rounded-lg">
                                            {viewingLesson.type === 'youtube' ? (
                                                <Video className="w-5 h-5" />
                                            ) : viewingLesson.type === 'document' ? (
                                                <FileText className="w-5 h-5" />
                                            ) : (
                                                <BookOpen className="w-5 h-5" />
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold truncate">{viewingLesson.title}</h3>
                                            <p className="text-blue-100 text-sm">
                                                {viewingLesson.type === 'youtube' ? 'Video' : viewingLesson.type === 'document' ? 'Tài liệu' : 'Văn bản'}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowViewModal(false)}
                                        className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="lesson-view-modal-body">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Left Column - Content */}
                                    <div className="space-y-6">
                                        {viewingLesson.description && (
                                            <div>
                                                <h4 className="text-lg font-semibold text-gray-900 mb-3">Mô tả</h4>
                                                <p className="text-base text-gray-700 leading-relaxed">{viewingLesson.description}</p>
                                            </div>
                                        )}

                                        {viewingLesson.type === 'text' && viewingLesson.content && (
                                            <div>
                                                <h4 className="text-lg font-semibold text-gray-900 mb-3">Nội dung</h4>
                                                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                                                    <p className="text-base text-gray-800 leading-relaxed whitespace-pre-wrap">
                                                        {viewingLesson.content}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {viewingLesson.type === 'document' && viewingLesson.file_url && (
                                            <div>
                                                <h4 className="text-lg font-semibold text-gray-900 mb-3">Tài liệu</h4>
                                                <button
                                                    onClick={() => handleDownload(viewingLesson.file_url!, viewingLesson.file_name!)}
                                                    className="flex items-center gap-3 px-6 py-4 text-base text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-xl transition-colors w-full border border-blue-200"
                                                >
                                                    <Download className="w-6 h-6" />
                                                    <span className="font-medium">{viewingLesson.file_name}</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Column - Media & Info */}
                                    <div className="space-y-6">
                                        {viewingLesson.type === 'youtube' && viewingLesson.youtube_id && (
                                            <div>
                                                <h4 className="text-lg font-semibold text-gray-900 mb-3">Video</h4>
                                                <div className="relative w-full aspect-video bg-gray-100 rounded-xl overflow-hidden shadow-lg">
                                                    <iframe
                                                        width="100%"
                                                        height="100%"
                                                        src={`https://www.youtube.com/embed/${viewingLesson.youtube_id}`}
                                                        title={viewingLesson.title}
                                                        frameBorder="0"
                                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                        allowFullScreen
                                                        className="rounded-xl"
                                                    ></iframe>
                                                </div>
                                            </div>
                                        )}

                                        {/* Lesson Information */}
                                        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                                            <h4 className="text-lg font-semibold text-gray-900 mb-4">Thông tin bài giảng</h4>
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-3">
                                                    <Calendar className="w-5 h-5 text-gray-500" />
                                                    <div>
                                                        <p className="text-sm text-gray-500">Ngày tạo</p>
                                                        <p className="text-base font-medium text-gray-900">{toDate(viewingLesson.created_at).toLocaleDateString('vi-VN')}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <Clock className="w-5 h-5 text-gray-500" />
                                                    <div>
                                                        <p className="text-sm text-gray-500">Cập nhật lần cuối</p>
                                                        <p className="text-base font-medium text-gray-900">{toDate(viewingLesson.updated_at).toLocaleDateString('vi-VN')}</p>
                                                    </div>
                                                </div>
                                                {viewingLesson.teacher_name && (
                                                    <div className="flex items-center gap-3">
                                                        <User className="w-5 h-5 text-gray-500" />
                                                        <div>
                                                            <p className="text-sm text-gray-500">Giáo viên</p>
                                                            <p className="text-base font-medium text-gray-900">{viewingLesson.teacher_name}</p>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-3">
                                                    <FileText className="w-5 h-5 text-gray-500" />
                                                    <div>
                                                        <p className="text-sm text-gray-500">Loại bài giảng</p>
                                                        <p className="text-base font-medium text-gray-900">
                                                            {viewingLesson.type === 'youtube' ? 'Video' : viewingLesson.type === 'document' ? 'Tài liệu' : 'Văn bản'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="lesson-view-modal-footer">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="modern-badge modern-badge-success">
                                            <Eye className="w-3 h-3" />
                                            Bài giảng công khai
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setShowViewModal(false)}
                                        className="modern-btn modern-btn-secondary"
                                    >
                                        Đóng
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
