import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy, where } from 'firebase/firestore';
import { deleteUser as deleteAuthUser } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions, Profile, UserRole } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { User, Edit, Trash2, Plus, Mail, UserCheck, Search, Filter, AlertCircle, CheckCircle, UserX, UserPlus, Settings } from 'lucide-react';
import { checkCloudFunctions } from '../../utils/checkFunctions';

export function UserManagement() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<Profile | null>(null);
  const [deleteStats, setDeleteStats] = useState<{
    assignments: number;
    assignmentStudents: number;
    submissions: number;
    comments: number;
  } | null>(null);

  useEffect(() => {
    if (profile && profile.role === 'admin') {
      fetchUsers();
    }
  }, [profile]);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, roleFilter]);

  const fetchUsers = async () => {
    try {
      const q = query(collection(db, 'profiles'), orderBy('created_at', 'desc'));
      const querySnapshot = await getDocs(q);

      const usersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        created_at: doc.data().created_at?.toDate?.()?.toISOString() || doc.data().created_at,
        updated_at: doc.data().updated_at?.toDate?.()?.toISOString() || doc.data().updated_at,
      })) as Profile[];

      setUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
      showMessage('error', `Lỗi khi tải danh sách người dùng: ${error instanceof Error ? error.message : 'Không xác định'}`);
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = users;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(user =>
        user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by role
    if (roleFilter !== 'all') {
      filtered = filtered.filter(user => user.role === roleFilter);
    }

    setFilteredUsers(filtered);
  };

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'profiles', userId), {
        role: newRole,
        updated_at: new Date(),
      });

      setUsers(users.map(user =>
        user.id === userId ? { ...user, role: newRole } : user
      ));

      showMessage('success', `Đã cập nhật vai trò thành ${getRoleLabel(newRole)}`);
    } catch (error) {
      console.error('Error updating user role:', error);
      showMessage('error', 'Lỗi khi cập nhật vai trò');
    } finally {
      setUpdating(false);
    }
  };

  const disableUser = async (userId: string) => {
    try {
      await updateDoc(doc(db, 'profiles', userId), {
        disabled: true,
        disabled_at: new Date(),
        updated_at: new Date(),
      });

      setUsers(users.map(user =>
        user.id === userId ? { ...user, disabled: true, disabled_at: new Date().toISOString() } : user
      ));

      const user = users.find(u => u.id === userId);
      showMessage('success', `Đã vô hiệu hóa tài khoản ${user?.full_name}`);
    } catch (error) {
      console.error('Error disabling user:', error);
      showMessage('error', 'Lỗi khi vô hiệu hóa tài khoản');
    }
  };

  const enableUser = async (userId: string) => {
    try {
      await updateDoc(doc(db, 'profiles', userId), {
        disabled: false,
        disabled_at: null,
        updated_at: new Date(),
      });

      setUsers(users.map(user =>
        user.id === userId ? { ...user, disabled: false, disabled_at: undefined } : user
      ));

      const user = users.find(u => u.id === userId);
      showMessage('success', `Đã kích hoạt lại tài khoản ${user?.full_name}`);
    } catch (error) {
      console.error('Error enabling user:', error);
      showMessage('error', 'Lỗi khi kích hoạt tài khoản');
    }
  };

  const openDeleteModal = async (user: Profile) => {
    setUserToDelete(user);
    setShowDeleteModal(true);

    // Lấy thống kê dữ liệu sẽ bị xóa từ Cloud Function
    try {
      const getUserStats = httpsCallable(functions, 'getUserDeleteStats');
      const result = await getUserStats({ userId: user.id });

      const stats = result.data as {
        assignments: number;
        assignmentStudents: number;
        submissions: number;
        comments: number;
        userInfo: {
          name: string;
          email: string;
          role: string;
        };
      };

      setDeleteStats({
        assignments: stats.assignments,
        assignmentStudents: stats.assignmentStudents,
        submissions: stats.submissions,
        comments: stats.comments
      });
    } catch (error) {
      console.error('Error fetching delete stats:', error);
      setDeleteStats({
        assignments: 0,
        assignmentStudents: 0,
        submissions: 0,
        comments: 0
      });
    }
  };

  const closeDeleteModal = () => {
    setUserToDelete(null);
    setShowDeleteModal(false);
    setDeleteStats(null);
  };

  const deleteUser = async () => {
    if (!userToDelete) return;

    try {
      // Hiển thị loading state
      setUpdating(true);

      // Thử gọi Cloud Function trước
      try {
        const deleteUserCompletely = httpsCallable(functions, 'deleteUserCompletely');
        const result = await deleteUserCompletely({ userId: userToDelete.id });

        const response = result.data as {
          success: boolean;
          message: string;
          deletedData: {
            assignments: number | string;
            assignmentStudents: number | string;
            submissions: number | string;
            comments: number | string;
            profile: number;
            authUser: number;
          };
        };

        if (response.success) {
          // Cập nhật danh sách users
          setUsers(users.filter(user => user.id !== userToDelete.id));

          showMessage('success', `✅ ${response.message} - Đã xóa hoàn toàn cả authentication user!`);
          closeDeleteModal();
          return;
        }
      } catch (functionError: any) {
        console.warn('Cloud Function failed, falling back to client-side deletion:', functionError);

        // Fallback: Xóa dữ liệu từ client (không xóa được auth user)
        await deleteUserDataOnly();

        showMessage('warning', `⚠️ Đã xóa dữ liệu nhưng authentication user vẫn tồn tại. Cloud Functions chưa được deploy hoặc cấu hình đúng.`);
        closeDeleteModal();
      }

    } catch (error: any) {
      console.error('Error deleting user:', error);

      // Xử lý lỗi từ Cloud Function
      let errorMessage = 'Lỗi không xác định';
      if (error.code === 'functions/permission-denied') {
        errorMessage = 'Bạn không có quyền xóa người dùng';
      } else if (error.code === 'functions/not-found') {
        errorMessage = 'Không tìm thấy người dùng';
      } else if (error.code === 'functions/unauthenticated') {
        errorMessage = 'Bạn cần đăng nhập để thực hiện hành động này';
      } else if (error.message) {
        errorMessage = error.message;
      }

      showMessage('error', `Lỗi khi xóa người dùng: ${errorMessage}`);
    } finally {
      setUpdating(false);
    }
  };

  // Fallback function để xóa dữ liệu khi Cloud Functions không hoạt động
  const deleteUserDataOnly = async () => {
    if (!userToDelete) return;

    // 1. Xóa tất cả assignments của user (nếu là teacher)
    if (userToDelete.role === 'teacher') {
      const assignmentsQuery = query(
        collection(db, 'assignments'),
        where('teacher_id', '==', userToDelete.id)
      );
      const assignmentsSnapshot = await getDocs(assignmentsQuery);

      // Xóa tất cả assignment_students liên quan
      const assignmentIds = assignmentsSnapshot.docs.map(doc => doc.id);
      for (const assignmentId of assignmentIds) {
        const assignmentStudentsQuery = query(
          collection(db, 'assignment_students'),
          where('assignment_id', '==', assignmentId)
        );
        const assignmentStudentsSnapshot = await getDocs(assignmentStudentsQuery);

        for (const doc of assignmentStudentsSnapshot.docs) {
          await deleteDoc(doc.ref);
        }

        // Xóa assignment
        await deleteDoc(doc(db, 'assignments', assignmentId));
      }
    }

    // 2. Xóa tất cả assignment_students của user (nếu là student)
    if (userToDelete.role === 'student') {
      const assignmentStudentsQuery = query(
        collection(db, 'assignment_students'),
        where('student_id', '==', userToDelete.id)
      );
      const assignmentStudentsSnapshot = await getDocs(assignmentStudentsQuery);

      for (const doc of assignmentStudentsSnapshot.docs) {
        await deleteDoc(doc.ref);
      }
    }

    // 3. Xóa tất cả submissions của user
    const submissionsQuery = query(
      collection(db, 'submissions'),
      where('student_id', '==', userToDelete.id)
    );
    const submissionsSnapshot = await getDocs(submissionsQuery);

    for (const doc of submissionsSnapshot.docs) {
      await deleteDoc(doc.ref);
    }

    // 4. Xóa tất cả comments của user
    const commentsQuery = query(
      collection(db, 'comments'),
      where('user_id', '==', userToDelete.id)
    );
    const commentsSnapshot = await getDocs(commentsQuery);

    for (const doc of commentsSnapshot.docs) {
      await deleteDoc(doc.ref);
    }

    // 5. Cuối cùng xóa profile
    await deleteDoc(doc(db, 'profiles', userToDelete.id));

    // Cập nhật danh sách users
    setUsers(users.filter(user => user.id !== userToDelete.id));
  };

  const showMessage = (type: 'success' | 'error' | 'warning', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000); // Tăng thời gian hiển thị cho warning
  };

  const getRoleColor = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800 border-red-200';
      case 'teacher': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'student': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'Quản trị viên';
      case 'teacher': return 'Giáo viên';
      case 'student': return 'Học sinh';
      default: return role;
    }
  };

  const openEditModal = (user: Profile) => {
    setSelectedUser(user);
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setSelectedUser(null);
    setShowEditModal(false);
  };

  const handleRoleUpdate = async (newRole: UserRole) => {
    if (!selectedUser) return;

    await updateUserRole(selectedUser.id, newRole);
    closeEditModal();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý người dùng</h1>
          <p className="text-gray-600">Quản lý tài khoản và phân quyền trong hệ thống</p>
        </div>
        <button
          onClick={async () => {
            const isWorking = await checkCloudFunctions();
            if (isWorking) {
              showMessage('success', '✅ Cloud Functions đang hoạt động bình thường!');
            } else {
              showMessage('warning', '⚠️ Cloud Functions chưa được deploy hoặc có lỗi. Xem console để biết chi tiết.');
            }
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          title="Kiểm tra Cloud Functions"
        >
          <Settings className="w-4 h-4" />
          Kiểm tra Functions
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${message.type === 'success'
          ? 'bg-green-50 text-green-700 border border-green-200'
          : message.type === 'warning'
            ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
            : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : message.type === 'warning' ? (
            <AlertCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Tìm kiếm theo tên hoặc email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="sm:w-48">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Tất cả vai trò</option>
                <option value="admin">Quản trị viên</option>
                <option value="teacher">Giáo viên</option>
                <option value="student">Học sinh</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Người dùng
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Vai trò
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ngày tạo
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Hành động
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${user.disabled ? 'bg-red-200' : 'bg-gray-200'
                        }`}>
                        <User className={`h-5 w-5 ${user.disabled ? 'text-red-500' : 'text-gray-500'}`} />
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className={`text-sm font-medium ${user.disabled ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                        {user.full_name}
                        {user.disabled && <span className="ml-2 text-xs text-red-600">(Đã vô hiệu hóa)</span>}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {user.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getRoleColor(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(user.created_at).toLocaleDateString('vi-VN')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEditModal(user)}
                      disabled={updating}
                      className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                      title="Chỉnh sửa vai trò"
                    >
                      <Edit className="w-4 h-4" />
                    </button>

                    {user.disabled ? (
                      <button
                        onClick={() => enableUser(user.id)}
                        className="text-green-600 hover:text-green-900"
                        title="Kích hoạt tài khoản"
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => disableUser(user.id)}
                        className="text-orange-600 hover:text-orange-900"
                        title="Vô hiệu hóa tài khoản"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => openDeleteModal(user)}
                      className="text-red-600 hover:text-red-900"
                      title="Xóa người dùng"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <User className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Không tìm thấy người dùng</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm || roleFilter !== 'all'
                ? 'Thử thay đổi bộ lọc để xem kết quả khác'
                : 'Chưa có người dùng nào trong hệ thống'
              }
            </p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <UserCheck className="h-8 w-8 text-gray-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Tổng số
                </dt>
                <dd className="text-lg font-medium text-gray-900">
                  {users.length}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <UserCheck className="h-8 w-8 text-red-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Quản trị viên
                </dt>
                <dd className="text-lg font-medium text-gray-900">
                  {users.filter(u => u.role === 'admin').length}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <UserCheck className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Giáo viên
                </dt>
                <dd className="text-lg font-medium text-gray-900">
                  {users.filter(u => u.role === 'teacher').length}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <UserCheck className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Học sinh
                </dt>
                <dd className="text-lg font-medium text-gray-900">
                  {users.filter(u => u.role === 'student').length}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Role Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Thay đổi vai trò
            </h3>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Người dùng:</p>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{selectedUser.full_name}</p>
                  <p className="text-sm text-gray-500">{selectedUser.email}</p>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-3">Chọn vai trò mới:</p>
              <div className="space-y-2">
                {(['admin', 'teacher', 'student'] as UserRole[]).map((role) => (
                  <button
                    key={role}
                    onClick={() => handleRoleUpdate(role)}
                    disabled={updating || selectedUser.role === role}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedUser.role === role
                      ? 'bg-gray-100 border-gray-300 cursor-not-allowed'
                      : 'hover:bg-gray-50 border-gray-200'
                      } ${updating ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{getRoleLabel(role)}</span>
                      {selectedUser.role === role && (
                        <span className="text-xs text-gray-500">(Hiện tại)</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={closeEditModal}
                disabled={updating}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                Xác nhận xóa người dùng
              </h3>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-3">
                Bạn có chắc chắn muốn xóa người dùng này?
              </p>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{userToDelete.full_name}</p>
                  <p className="text-sm text-gray-500">{userToDelete.email}</p>
                </div>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-800">
                  <p className="font-medium mb-2">⚠️ Hành động này sẽ xóa hoàn toàn:</p>

                  {deleteStats && (
                    <div className="bg-white rounded-lg p-3 mb-3 border border-red-200">
                      <p className="font-medium text-red-900 mb-2">Thống kê dữ liệu sẽ bị xóa:</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {userToDelete.role === 'teacher' && (
                          <>
                            <div className="flex justify-between">
                              <span>Bài tập:</span>
                              <span className="font-medium">{deleteStats.assignments}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Liên kết bài tập:</span>
                              <span className="font-medium">{deleteStats.assignmentStudents}</span>
                            </div>
                          </>
                        )}
                        {userToDelete.role === 'student' && (
                          <>
                            <div className="flex justify-between">
                              <span>Bài tập được giao:</span>
                              <span className="font-medium">{deleteStats.assignmentStudents}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Bài nộp:</span>
                              <span className="font-medium">{deleteStats.submissions}</span>
                            </div>
                          </>
                        )}
                        <div className="flex justify-between">
                          <span>Nhận xét:</span>
                          <span className="font-medium">{deleteStats.comments}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Profile:</span>
                          <span className="font-medium">1</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li className="font-medium text-green-900">✅ Tài khoản authentication sẽ bị xóa hoàn toàn</li>
                    <li className="font-medium text-red-900">⚠️ Hành động này không thể hoàn tác</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={closeDeleteModal}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={deleteUser}
                disabled={updating}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {updating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Đang xóa...
                  </>
                ) : (
                  'Xóa hoàn toàn'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}