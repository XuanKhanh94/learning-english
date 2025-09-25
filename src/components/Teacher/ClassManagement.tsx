import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';
import { db, Profile } from '../../lib/firebase';
import { Users, BookOpen, GraduationCap, Calendar, Plus, Edit, Trash2, MoreVertical } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import CreateClassModal from './CreateClassModal';

interface Class {
    id: string;
    name: string;
    description: string;
    subject: string;
    schedule: string;
    location: string;
    max_students: number;
    start_date: string;
    end_date: string;
    created_at: any;
    status: string;
    student_count: number;
}

function ClassManagement() {
    const { profile } = useAuth();
    const [students, setStudents] = useState<Profile[]>([]);
    const [classes, setClasses] = useState<Class[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingClasses, setLoadingClasses] = useState(true);
    const [error, setError] = useState('');
    const [showCreateClassModal, setShowCreateClassModal] = useState(false);
    const [editingClass, setEditingClass] = useState<Class | null>(null);
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);

    useEffect(() => {
        fetchStudents();
        fetchClasses();
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (openDropdown) {
                setOpenDropdown(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [openDropdown]);

    const fetchStudents = async () => {
        setLoading(true);
        setError('');
        try {
            const q = query(
                collection(db, 'profiles'),
                where('role', '==', 'student')
            );
            const querySnapshot = await getDocs(q);

            const studentsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Profile[];

            studentsData.sort((a, b) => a.full_name.localeCompare(b.full_name));
            setStudents(studentsData);
        } catch (error) {
            console.error('Error fetching students:', error);
            setError('Không thể tải danh sách học sinh. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    };

    const fetchClasses = async () => {
        setLoadingClasses(true);
        try {
            const q = query(collection(db, 'classes'));
            const querySnapshot = await getDocs(q);

            const classesData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Class[];

            classesData.sort((a, b) => b.created_at?.toDate?.() - a.created_at?.toDate?.());
            setClasses(classesData);
        } catch (error) {
            console.error('Error fetching classes:', error);
        } finally {
            setLoadingClasses(false);
        }
    };

    const handleEditClass = (classItem: Class) => {
        setEditingClass(classItem);
        setOpenDropdown(null);
    };

    const handleDeleteClass = async (classId: string) => {
        if (window.confirm('Bạn có chắc chắn muốn xóa lớp học này? Hành động này không thể hoàn tác.')) {
            try {
                // Delete class
                await deleteDoc(doc(db, 'classes', classId));

                // TODO: Also delete related class_students records
                // For now, just refresh the classes list
                fetchClasses();

                console.log('Class deleted successfully');
            } catch (error) {
                console.error('Error deleting class:', error);
                alert('Có lỗi xảy ra khi xóa lớp học. Vui lòng thử lại.');
            }
        }
        setOpenDropdown(null);
    };

    const handleCloseEditModal = () => {
        setEditingClass(null);
    };

    const handleEditSuccess = () => {
        fetchClasses(); // Refresh class list after editing
        setEditingClass(null);
    };

    return (
        <div className="modern-bg-primary h-screen flex flex-col">
            {/* Fixed Header */}
            <div className="flex-shrink-0">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                    <div className="modern-card-header p-6 sm:p-8 modern-animate-fade-in-up">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <div className="p-3 sm:p-4 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl shadow-lg">
                                    <BookOpen className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                                </div>
                                <div>
                                    <h1 className="modern-heading-2">Lớp học</h1>
                                    <p className="modern-text-muted mt-2">Quản lý lớp học và học sinh</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowCreateClassModal(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors shadow-sm"
                            >
                                <Plus className="w-4 h-4" />
                                Tạo lớp học
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                    <div className="space-y-6 sm:space-y-8">
                        {/* Class Statistics */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-blue-100 rounded-xl">
                                        <Users className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-gray-900">{students.length}</p>
                                        <p className="text-sm text-gray-600">Tổng số học sinh</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-green-100 rounded-xl">
                                        <GraduationCap className="w-6 h-6 text-green-600" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-gray-900">{classes.length}</p>
                                        <p className="text-sm text-gray-600">Lớp học đã tạo</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-orange-100 rounded-xl">
                                        <Calendar className="w-6 h-6 text-orange-600" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-gray-900">0</p>
                                        <p className="text-sm text-gray-600">Bài tập sắp đến hạn</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Classes List */}
                        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-100">
                                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 rounded-xl shadow-sm">
                                        <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                                    </div>
                                    Danh sách lớp học
                                </h2>
                                <p className="text-sm text-gray-600 mt-1">Quản lý các lớp học đã tạo</p>
                            </div>

                            <div className="p-6">
                                {loadingClasses ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                                        <span className="ml-3 text-gray-600 font-medium">Đang tải danh sách lớp học...</span>
                                    </div>
                                ) : classes.length === 0 ? (
                                    <div className="text-center py-12">
                                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <BookOpen className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">Chưa có lớp học nào</h3>
                                        <p className="text-gray-500 mb-4">
                                            Bạn chưa tạo lớp học nào. Hãy tạo lớp học đầu tiên để bắt đầu.
                                        </p>
                                        <button
                                            onClick={() => setShowCreateClassModal(true)}
                                            className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors shadow-sm mx-auto"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Tạo lớp học đầu tiên
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {classes.map((classItem) => (
                                            <div key={classItem.id} className="p-6 border border-gray-200 rounded-xl hover:shadow-md transition-shadow bg-white">
                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="flex-1">
                                                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                                                            {classItem.name}
                                                        </h3>
                                                        <p className="text-sm text-gray-600 mb-2">
                                                            {classItem.subject}
                                                        </p>
                                                        {classItem.description && (
                                                            <p className="text-xs text-gray-500 line-clamp-2">
                                                                {classItem.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="ml-3 flex items-center gap-2">
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                            {classItem.status}
                                                        </span>

                                                        {/* Dropdown Menu */}
                                                        <div className="relative">
                                                            <button
                                                                onClick={() => setOpenDropdown(openDropdown === classItem.id ? null : classItem.id)}
                                                                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                                                            >
                                                                <MoreVertical className="w-4 h-4 text-gray-500" />
                                                            </button>

                                                            {openDropdown === classItem.id && (
                                                                <div className="absolute right-0 top-8 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                                                                    <div className="py-1">
                                                                        <button
                                                                            onClick={() => handleEditClass(classItem)}
                                                                            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                                                                        >
                                                                            <Edit className="w-4 h-4" />
                                                                            Chỉnh sửa
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDeleteClass(classItem.id)}
                                                                            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                                                        >
                                                                            <Trash2 className="w-4 h-4" />
                                                                            Xóa
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-2 text-sm text-gray-600">
                                                    {classItem.schedule && (
                                                        <div className="flex items-center gap-2">
                                                            <Calendar className="w-4 h-4" />
                                                            <span>{classItem.schedule}</span>
                                                        </div>
                                                    )}
                                                    {classItem.location && (
                                                        <div className="flex items-center gap-2">
                                                            <BookOpen className="w-4 h-4" />
                                                            <span>{classItem.location}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-2">
                                                        <Users className="w-4 h-4" />
                                                        <span>{classItem.student_count} học sinh</span>
                                                        {classItem.max_students && (
                                                            <span className="text-gray-400">/ {classItem.max_students}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Students List */}
                        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
                            <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4 border-b border-gray-100">
                                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center gap-3">
                                    <div className="p-2 bg-green-100 rounded-xl shadow-sm">
                                        <Users className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                                    </div>
                                    Danh sách học sinh
                                </h2>
                                <p className="text-sm text-gray-600 mt-1">Quản lý thông tin học sinh trong hệ thống</p>
                            </div>

                            <div className="p-6">
                                {error && (
                                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                                                <span className="text-red-600 text-sm">⚠</span>
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-red-700 font-medium">{error}</p>
                                                <button
                                                    onClick={fetchStudents}
                                                    className="mt-1 text-red-600 hover:text-red-700 text-sm underline"
                                                >
                                                    Thử lại
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {loading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                                        <span className="ml-3 text-gray-600 font-medium">Đang tải danh sách học sinh...</span>
                                    </div>
                                ) : students.length === 0 ? (
                                    <div className="text-center py-12">
                                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Users className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <h3 className="text-lg font-medium text-gray-900 mb-2">Chưa có học sinh nào</h3>
                                        <p className="text-gray-500 mb-4">
                                            Chưa có học sinh nào trong hệ thống.
                                        </p>
                                        <button
                                            onClick={fetchStudents}
                                            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                                        >
                                            Tải lại
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {students.map((student) => (
                                            <div key={student.id} className="p-4 border border-gray-200 rounded-xl hover:shadow-md transition-shadow">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
                                                        <span className="text-white font-semibold text-lg">
                                                            {student.full_name.charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-gray-900 truncate">
                                                            {student.full_name}
                                                        </p>
                                                        <p className="text-xs text-gray-500 truncate">
                                                            {student.email}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Create Class Modal */}
            <CreateClassModal
                isOpen={showCreateClassModal}
                onClose={() => setShowCreateClassModal(false)}
                onSuccess={() => {
                    fetchClasses(); // Refresh class list after creating
                    console.log('Class created successfully');
                }}
            />

            {/* Edit Class Modal */}
            {editingClass && (
                <CreateClassModal
                    isOpen={true}
                    onClose={handleCloseEditModal}
                    onSuccess={handleEditSuccess}
                    editingClass={editingClass}
                />
            )}
        </div>
    );
}

export default ClassManagement;
