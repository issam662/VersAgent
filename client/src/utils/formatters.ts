/**
 * Formats a date string or object to dd/mm/yy hh:mm:ss
 */
export const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return 'Never';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'N/A';

    return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).replace(',', '');
};

/**
 * Formats a date for short display (no seconds)
 */
export const formatShortDate = (date: string | Date | null | undefined): string => {
    if (!date) return 'Never';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'N/A';

    return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).replace(',', '');
};

/**
 * Formats a date for display (date only)
 */
export const formatOnlyDate = (date: string | Date | null | undefined): string => {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';

    return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
};

/**
 * Formats bytes to human readable string (KB, MB, GB)
 */
export const formatBytes = (bytes: number, decimals = 2): string => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};
/**
 * Standardizes the display of department names:
 * 1. Replaces underscores with spaces
 * 2. Converts to Title Case
 * 3. Keeps IT, ME, HR capitalized
 */
export const formatDepartment = (name: string | null | undefined): string => {
    if (!name) return '-';

    // Replace underscores with spaces
    let formatted = name.replace(/_/g, ' ');

    // Split into words
    const words = formatted.split(' ');

    const transformedWords = words.map(word => {
        const upperWord = word.toUpperCase();

        // Handle specific acronyms (2-letter or special cases)
        if (['IT', 'ME', 'HR'].includes(upperWord)) {
            return upperWord;
        }

        // Handle Title Case
        if (word.length === 0) return '';
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });

    return transformedWords.join(' ');
};
