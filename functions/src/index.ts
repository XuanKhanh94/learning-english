import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin with Service Account
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
});

const db = admin.firestore();
const auth = admin.auth();

// Cloud Function để xóa hoàn toàn user
export const deleteUserCompletely = functions.https.onCall(async (data, context) => {
    try {
        // Kiểm tra authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        // Kiểm tra quyền admin
        const adminDoc = await db.collection('profiles').doc(context.auth.uid).get();
        if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
            throw new functions.https.HttpsError('permission-denied', 'Only admins can delete users');
        }

        const { userId } = data;
        if (!userId) {
            throw new functions.https.HttpsError('invalid-argument', 'User ID is required');
        }

        // Lấy thông tin user
        const userDoc = await db.collection('profiles').doc(userId).get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User not found');
        }

        const userData = userDoc.data();
        if (!userData) {
            throw new functions.https.HttpsError('not-found', 'User data not found');
        }

        // 1. Xóa tất cả assignments của user (nếu là teacher)
        if (userData.role === 'teacher') {
            const assignmentsQuery = db.collection('assignments').where('teacher_id', '==', userId);
            const assignmentsSnapshot = await assignmentsQuery.get();

            // Xóa tất cả assignment_students liên quan
            const assignmentIds = assignmentsSnapshot.docs.map(doc => doc.id);
            for (const assignmentId of assignmentIds) {
                const assignmentStudentsQuery = db.collection('assignment_students').where('assignment_id', '==', assignmentId);
                const assignmentStudentsSnapshot = await assignmentStudentsQuery.get();

                const batch = db.batch();
                assignmentStudentsSnapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();

                // Xóa assignment
                await db.collection('assignments').doc(assignmentId).delete();
            }
        }

        // 2. Xóa tất cả assignment_students của user (nếu là student)
        if (userData.role === 'student') {
            const assignmentStudentsQuery = db.collection('assignment_students').where('student_id', '==', userId);
            const assignmentStudentsSnapshot = await assignmentStudentsQuery.get();

            const batch = db.batch();
            assignmentStudentsSnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }

        // 3. Xóa tất cả submissions của user
        const submissionsQuery = db.collection('submissions').where('student_id', '==', userId);
        const submissionsSnapshot = await submissionsQuery.get();

        const submissionsBatch = db.batch();
        submissionsSnapshot.docs.forEach(doc => {
            submissionsBatch.delete(doc.ref);
        });
        await submissionsBatch.commit();

        // 4. Xóa tất cả comments của user
        const commentsQuery = db.collection('comments').where('user_id', '==', userId);
        const commentsSnapshot = await commentsQuery.get();

        const commentsBatch = db.batch();
        commentsSnapshot.docs.forEach(doc => {
            commentsBatch.delete(doc.ref);
        });
        await commentsBatch.commit();

        // 5. Xóa profile
        await db.collection('profiles').doc(userId).delete();

        // 6. Xóa authentication user
        try {
            await auth.deleteUser(userId);
        } catch (authError) {
            console.error('Error deleting auth user:', authError);
            // Không throw error vì dữ liệu đã được xóa thành công
        }

        return {
            success: true,
            message: `User ${userData.full_name} has been completely deleted`,
            deletedData: {
                assignments: userData.role === 'teacher' ? 'all' : 0,
                assignmentStudents: 'all',
                submissions: 'all',
                comments: 'all',
                profile: 1,
                authUser: 1
            }
        };

    } catch (error) {
        console.error('Error deleting user:', error);
        throw new functions.https.HttpsError('internal', 'Failed to delete user');
    }
});

// Cloud Function để lấy thống kê user trước khi xóa
export const getUserDeleteStats = functions.https.onCall(async (data, context) => {
    try {
        // Kiểm tra authentication
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }

        // Kiểm tra quyền admin
        const adminDoc = await db.collection('profiles').doc(context.auth.uid).get();
        if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
            throw new functions.https.HttpsError('permission-denied', 'Only admins can view user stats');
        }

        const { userId } = data;
        if (!userId) {
            throw new functions.https.HttpsError('invalid-argument', 'User ID is required');
        }

        let assignments = 0;
        let assignmentStudents = 0;
        let submissions = 0;
        let comments = 0;

        // Đếm assignments (nếu là teacher)
        const userDoc = await db.collection('profiles').doc(userId).get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User not found');
        }

        const userData = userDoc.data();
        if (!userData) {
            throw new functions.https.HttpsError('not-found', 'User data not found');
        }

        if (userData.role === 'teacher') {
            const assignmentsQuery = db.collection('assignments').where('teacher_id', '==', userId);
            const assignmentsSnapshot = await assignmentsQuery.get();
            assignments = assignmentsSnapshot.docs.length;

            // Đếm assignment_students liên quan
            const assignmentIds = assignmentsSnapshot.docs.map(doc => doc.id);
            for (const assignmentId of assignmentIds) {
                const assignmentStudentsQuery = db.collection('assignment_students').where('assignment_id', '==', assignmentId);
                const assignmentStudentsSnapshot = await assignmentStudentsQuery.get();
                assignmentStudents += assignmentStudentsSnapshot.docs.length;
            }
        }

        // Đếm assignment_students (nếu là student)
        if (userData.role === 'student') {
            const assignmentStudentsQuery = db.collection('assignment_students').where('student_id', '==', userId);
            const assignmentStudentsSnapshot = await assignmentStudentsQuery.get();
            assignmentStudents = assignmentStudentsSnapshot.docs.length;
        }

        // Đếm submissions
        const submissionsQuery = db.collection('submissions').where('student_id', '==', userId);
        const submissionsSnapshot = await submissionsQuery.get();
        submissions = submissionsSnapshot.docs.length;

        // Đếm comments
        const commentsQuery = db.collection('comments').where('user_id', '==', userId);
        const commentsSnapshot = await commentsQuery.get();
        comments = commentsSnapshot.docs.length;

        return {
            assignments,
            assignmentStudents,
            submissions,
            comments,
            userInfo: {
                name: userData.full_name,
                email: userData.email,
                role: userData.role
            }
        };

    } catch (error) {
        console.error('Error getting user stats:', error);
        throw new functions.https.HttpsError('internal', 'Failed to get user stats');
    }
});