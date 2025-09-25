import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

export const checkCloudFunctions = async () => {
    try {
        console.log('🔍 Checking Cloud Functions...');

        // Test function để kiểm tra functions có hoạt động không
        const testFunction = httpsCallable(functions, 'getUserDeleteStats');

        // Thử gọi với một user ID giả (sẽ fail nhưng cho biết functions có hoạt động không)
        await testFunction({ userId: 'test-user-id' });

        console.log('✅ Cloud Functions are working!');
        return true;
    } catch (error: any) {
        console.error('❌ Cloud Functions error:', error);

        if (error.code === 'functions/not-found') {
            console.log('🔧 Functions not found - need to deploy');
            return false;
        } else if (error.code === 'functions/permission-denied') {
            console.log('🔧 Permission denied - check authentication');
            return false;
        } else if (error.code === 'functions/unauthenticated') {
            console.log('🔧 Not authenticated - need to login');
            return false;
        } else {
            console.log('🔧 Other error:', error.message);
            return false;
        }
    }
};

export const testDeleteFunction = async (userId: string) => {
    try {
        console.log('🧪 Testing delete function...');

        const deleteFunction = httpsCallable(functions, 'deleteUserCompletely');
        const result = await deleteFunction({ userId });

        console.log('✅ Delete function result:', result.data);
        return result.data;
    } catch (error: any) {
        console.error('❌ Delete function error:', error);
        return null;
    }
};
