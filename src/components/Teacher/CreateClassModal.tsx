import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, Profile } from '../../lib/firebase';
import { X, BookOpen, Users, Calendar, MapPin, Check, Search } from 'lucide-react';

interface CreateClassModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    editingClass?: any;
}

function CreateClassModal({ isOpen, onClose, onSuccess, editingClass }: CreateClassModalProps) {
    const [formData, setFormData] = useState({
        className: '',
        description: '',
        subject: '',
        schedule: '',
        location: '',
        maxStudents: '',
        startDate: '',
        endDate: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [students, setStudents] = useState<Profile[]>([]);
    const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchStudents();
            if (editingClass) {
                // Populate form with existing class data
                setFormData({
                    className: editingClass.name || '',
                    description: editingClass.description || '',
                    subject: editingClass.subject || '',
                    schedule: editingClass.schedule || '',
                    location: editingClass.location || '',
                    maxStudents: editingClass.max_students?.toString() || '',
                    startDate: editingClass.start_date || '',
                    endDate: editingClass.end_date || ''
                });
            } else {
                // Reset form for new class
                setFormData({
                    className: '',
                    description: '',
                    subject: '',
                    schedule: '',
                    location: '',
                    maxStudents: '',
                    startDate: '',
                    endDate: ''
                });
            }
        }
    }, [isOpen, editingClass]);

    const fetchStudents = async () => {
        setLoadingStudents(true);
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
            setLoadingStudents(false);
        }
    };

    const handleStudentToggle = (studentId: string) => {
        setSelectedStudents(prev =>
            prev.includes(studentId)
                ? prev.filter(id => id !== studentId)
                : [...prev, studentId]
        );
    };

    const handleSelectAll = () => {
        if (selectedStudents.length === filteredStudents.length) {
            setSelectedStudents([]);
        } else {
            setSelectedStudents(filteredStudents.map(student => student.id));
        }
    };

    // Filter students based on search term
    const filteredStudents = useMemo(() => {
        if (!searchTerm.trim()) return students;

        return students.filter(student =>
            student.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            student.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [students, searchTerm]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Validate required fields
            if (!formData.className.trim()) {
                setError('Vui lòng nhập tên lớp học');
                setLoading(false);
                return;
            }
            if (!formData.subject) {
                setError('Vui lòng chọn môn học');
                setLoading(false);
                return;
            }

            // Create class data
            const classData = {
                name: formData.className,
                description: formData.description || '',
                subject: formData.subject,
                schedule: formData.schedule || '',
                location: formData.location || '',
                max_students: formData.maxStudents ? parseInt(formData.maxStudents) : null,
                start_date: formData.startDate || null,
                end_date: formData.endDate || null,
                created_at: serverTimestamp(),
                status: 'active',
                student_count: selectedStudents.length
            };

            if (editingClass) {
                // Update existing class
                await updateDoc(doc(db, 'classes', editingClass.id), classData);
            } else {
                // Add class to database
                const classRef = await addDoc(collection(db, 'classes'), classData);

                // Add students to class if any are selected
                if (selectedStudents.length > 0) {
                    const classStudents = selectedStudents.map(studentId => ({
                        class_id: classRef.id,
                        student_id: studentId,
                        enrolled_at: serverTimestamp(),
                        status: 'active'
                    }));

                    for (const classStudent of classStudents) {
                        await addDoc(collection(db, 'class_students'), classStudent);
                    }
                }
            }

            // Reset form
            setFormData({
                className: '',
                description: '',
                subject: '',
                schedule: '',
                location: '',
                maxStudents: '',
                startDate: '',
                endDate: ''
            });
            setSelectedStudents([]);

            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error creating class:', error);
            setError('Có lỗi xảy ra khi tạo lớp học. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-xl">
                                <BookOpen className="w-6 h-6 text-purple-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900">
                                    {editingClass ? 'Chỉnh sửa lớp học' : 'Tạo lớp học mới'}
                                </h2>
                                <p className="text-sm text-gray-600">
                                    {editingClass ? 'Cập nhật thông tin lớp học' : 'Thiết lập thông tin lớp học'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>
                </div>

                {/* Modal Content */}
                <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        {error && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                                <p className="text-red-700 text-sm">{error}</p>
                            </div>
                        )}

                        {/* Basic Information */}
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="className" className="block text-sm font-semibold text-gray-700 mb-2">
                                    Tên lớp học *
                                </label>
                                <input
                                    type="text"
                                    id="className"
                                    name="className"
                                    value={formData.className}
                                    onChange={handleInputChange}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-gray-50 focus:bg-white"
                                    placeholder="Ví dụ: Lớp 10A1, Toán nâng cao..."
                                    required
                                />
                            </div>

                            <div>
                                <label htmlFor="subject" className="block text-sm font-semibold text-gray-700 mb-2">
                                    Môn học *
                                </label>
                                <select
                                    id="subject"
                                    name="subject"
                                    value={formData.subject}
                                    onChange={handleInputChange}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-gray-50 focus:bg-white"
                                    required
                                >
                                    <option value="">Chọn môn học</option>
                                    <option value="toan">Toán học</option>
                                    <option value="van">Ngữ văn</option>
                                    <option value="anh">Tiếng Anh</option>
                                    <option value="ly">Vật lý</option>
                                    <option value="hoa">Hóa học</option>
                                    <option value="sinh">Sinh học</option>
                                    <option value="su">Lịch sử</option>
                                    <option value="dia">Địa lý</option>
                                    <option value="gdcd">Giáo dục công dân</option>
                                    <option value="tin">Tin học</option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
                                    Mô tả lớp học
                                </label>
                                <textarea
                                    id="description"
                                    name="description"
                                    value={formData.description}
                                    onChange={handleInputChange}
                                    rows={3}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-gray-50 focus:bg-white resize-none"
                                    placeholder="Mô tả về lớp học, mục tiêu học tập..."
                                />
                            </div>
                        </div>

                        {/* Schedule and Location */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="schedule" className="block text-sm font-semibold text-gray-700 mb-2">
                                    <Calendar className="w-4 h-4 inline mr-2" />
                                    Lịch học
                                </label>
                                <input
                                    type="text"
                                    id="schedule"
                                    name="schedule"
                                    value={formData.schedule}
                                    onChange={handleInputChange}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-gray-50 focus:bg-white"
                                    placeholder="Ví dụ: Thứ 2,4,6 - 7:00-8:30"
                                />
                            </div>

                            <div>
                                <label htmlFor="location" className="block text-sm font-semibold text-gray-700 mb-2">
                                    <MapPin className="w-4 h-4 inline mr-2" />
                                    Địa điểm
                                </label>
                                <input
                                    type="text"
                                    id="location"
                                    name="location"
                                    value={formData.location}
                                    onChange={handleInputChange}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-gray-50 focus:bg-white"
                                    placeholder="Phòng học, địa chỉ..."
                                />
                            </div>
                        </div>

                        {/* Capacity and Duration */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label htmlFor="maxStudents" className="block text-sm font-semibold text-gray-700 mb-2">
                                    <Users className="w-4 h-4 inline mr-2" />
                                    Sĩ số tối đa
                                </label>
                                <input
                                    type="number"
                                    id="maxStudents"
                                    name="maxStudents"
                                    value={formData.maxStudents}
                                    onChange={handleInputChange}
                                    min="1"
                                    max="50"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-gray-50 focus:bg-white"
                                    placeholder="30"
                                />
                            </div>

                            <div>
                                <label htmlFor="startDate" className="block text-sm font-semibold text-gray-700 mb-2">
                                    Ngày bắt đầu
                                </label>
                                <input
                                    type="date"
                                    id="startDate"
                                    name="startDate"
                                    value={formData.startDate}
                                    onChange={handleInputChange}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-gray-50 focus:bg-white"
                                />
                            </div>

                            <div>
                                <label htmlFor="endDate" className="block text-sm font-semibold text-gray-700 mb-2">
                                    Ngày kết thúc
                                </label>
                                <input
                                    type="date"
                                    id="endDate"
                                    name="endDate"
                                    value={formData.endDate}
                                    onChange={handleInputChange}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-gray-50 focus:bg-white"
                                />
                            </div>
                        </div>

                        {/* Student Selection */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="block text-sm font-semibold text-gray-700">
                                    <Users className="w-4 h-4 inline mr-2" />
                                    Chọn học sinh cho lớp học
                                </label>
                                {filteredStudents.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleSelectAll}
                                        className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                                    >
                                        {selectedStudents.length === filteredStudents.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                                    </button>
                                )}
                            </div>

                            {/* Search Input */}
                            {students.length > 0 && (
                                <div className="mb-4">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Tìm kiếm học sinh theo tên hoặc email..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
                                        />
                                    </div>
                                </div>
                            )}

                            {loadingStudents ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500"></div>
                                    <span className="ml-3 text-gray-600">Đang tải danh sách học sinh...</span>
                                </div>
                            ) : students.length === 0 ? (
                                <div className="text-center py-8">
                                    <Users className="mx-auto h-12 w-12 text-gray-400" />
                                    <h3 className="mt-2 text-sm font-medium text-gray-900">Chưa có học sinh nào</h3>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Chưa có học sinh nào trong hệ thống.
                                    </p>
                                </div>
                            ) : (
                                <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-xl p-4">
                                    {filteredStudents.length === 0 && searchTerm ? (
                                        <div className="text-center py-8">
                                            <Search className="mx-auto h-8 w-8 text-gray-400" />
                                            <p className="mt-2 text-sm text-gray-500">
                                                Không tìm thấy học sinh nào với từ khóa "{searchTerm}"
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-3">
                                            {filteredStudents.map((student) => (
                                                <label
                                                    key={student.id}
                                                    className="flex items-center p-3 rounded-lg hover:bg-gray-50 cursor-pointer border border-gray-200 transition-colors"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedStudents.includes(student.id)}
                                                        onChange={() => handleStudentToggle(student.id)}
                                                        className="mr-3 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                                                    />
                                                    <div className="flex-1">
                                                        <p className="text-sm font-semibold text-gray-900">{student.full_name}</p>
                                                        <p className="text-xs text-gray-500">{student.email}</p>
                                                    </div>
                                                    {selectedStudents.includes(student.id) && (
                                                        <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                                                            <Check className="w-3 h-3 text-purple-600" />
                                                        </div>
                                                    )}
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {selectedStudents.length > 0 && (
                                <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-xl">
                                    <div className="flex items-center gap-2">
                                        <Users className="w-4 h-4 text-purple-600" />
                                        <p className="text-sm font-medium text-purple-700">
                                            Đã chọn {selectedStudents.length} học sinh
                                        </p>
                                    </div>
                                    {formData.maxStudents && selectedStudents.length > parseInt(formData.maxStudents) && (
                                        <p className="text-xs text-red-600 mt-1">
                                            ⚠️ Số học sinh đã chọn ({selectedStudents.length}) vượt quá sĩ số tối đa ({formData.maxStudents})
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                Hủy
                            </button>
                            <button
                                type="submit"
                                disabled={
                                    loading ||
                                    !formData.className.trim() ||
                                    !formData.subject ||
                                    (formData.maxStudents && selectedStudents.length > parseInt(formData.maxStudents))
                                }
                                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white rounded-lg transition-colors"
                            >
                                {loading ? (editingClass ? 'Đang cập nhật...' : 'Đang tạo...') : (editingClass ? 'Cập nhật lớp học' : 'Tạo lớp học')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default CreateClassModal;
