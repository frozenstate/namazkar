/**
 * IndexedDB persistence layer for caching prayer times and offsets
 * Provides fast offline access and instant cold-start loading
 */

const DB_NAME = 'namazkar-cache';
const DB_VERSION = 2;
const TABLES = {
  TIMETABLE: 'timetable',
  OFFSETS: 'offsets',
  CALENDAR: 'calendar'
};

let db = null;

/**
 * Initialize IndexedDB connection
 * @returns {Promise<IDBDatabase>}
 */
async function initDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[persist-storage] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('[persist-storage] IndexedDB initialized');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      
      // Create timetable store
      if (!database.objectStoreNames.contains(TABLES.TIMETABLE)) {
        database.createObjectStore(TABLES.TIMETABLE, { keyPath: 'id' });
        console.log('[persist-storage] Created timetable store');
      }

      // Create offsets store
      if (!database.objectStoreNames.contains(TABLES.OFFSETS)) {
        database.createObjectStore(TABLES.OFFSETS, { keyPath: 'id' });
        console.log('[persist-storage] Created offsets store');
      }

      // Create calendar store
      if (!database.objectStoreNames.contains(TABLES.CALENDAR)) {
        database.createObjectStore(TABLES.CALENDAR, { keyPath: 'id' });
        console.log('[persist-storage] Created calendar store');
      }
    };
  });
}

/**
 * Save timetable data to IndexedDB
 * @param {Object} timetable - The timetable data
 * @returns {Promise<void>}
 */
async function saveTimetable(timetable) {
  if (!timetable || typeof timetable !== 'object') return;
  
  try {
    const database = await initDB();
    const tx = database.transaction(TABLES.TIMETABLE, 'readwrite');
    const store = tx.objectStore(TABLES.TIMETABLE);
    
    await new Promise((resolve, reject) => {
      const request = store.put({
        id: 'main',
        data: timetable,
        timestamp: Date.now()
      });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
    
    console.log('[persist-storage] Timetable saved to IndexedDB');
  } catch (err) {
    console.error('[persist-storage] Error saving timetable:', err && err.message);
  }
}

/**
 * Retrieve timetable data from IndexedDB
 * @returns {Promise<Object|null>}
 */
async function getTimetable() {
  try {
    const database = await initDB();
    const tx = database.transaction(TABLES.TIMETABLE, 'readonly');
    const store = tx.objectStore(TABLES.TIMETABLE);
    
    return new Promise((resolve, reject) => {
      const request = store.get('main');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          console.log('[persist-storage] Timetable loaded from IndexedDB (age:', Date.now() - result.timestamp, 'ms)');
          resolve(result.data);
        } else {
          resolve(null);
        }
      };
    });
  } catch (err) {
    console.error('[persist-storage] Error reading timetable:', err && err.message);
    return null;
  }
}

/**
 * Save offsets data to IndexedDB
 * @param {Object} offsets - The offsets data
 * @returns {Promise<void>}
 */
async function saveOffsets(offsets) {
  if (!offsets || typeof offsets !== 'object') return;
  
  try {
    const database = await initDB();
    const tx = database.transaction(TABLES.OFFSETS, 'readwrite');
    const store = tx.objectStore(TABLES.OFFSETS);
    
    await new Promise((resolve, reject) => {
      const request = store.put({
        id: 'main',
        data: offsets,
        timestamp: Date.now()
      });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
    
    console.log('[persist-storage] Offsets saved to IndexedDB');
  } catch (err) {
    console.error('[persist-storage] Error saving offsets:', err && err.message);
  }
}

/**
 * Retrieve offsets data from IndexedDB
 * @returns {Promise<Object|null>}
 */
async function getOffsets() {
  try {
    const database = await initDB();
    const tx = database.transaction(TABLES.OFFSETS, 'readonly');
    const store = tx.objectStore(TABLES.OFFSETS);
    
    return new Promise((resolve, reject) => {
      const request = store.get('main');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          console.log('[persist-storage] Offsets loaded from IndexedDB (age:', Date.now() - result.timestamp, 'ms)');
          resolve(result.data);
        } else {
          resolve(null);
        }
      };
    });
  } catch (err) {
    console.error('[persist-storage] Error reading offsets:', err && err.message);
    return null;
  }
}

/**
 * Save calendar settings to IndexedDB
 * @param {Object} settings - The calendar settings
 * @returns {Promise<void>}
 */
async function saveCalendarSettings(settings) {
  if (!settings || typeof settings !== 'object') return;

  try {
    const database = await initDB();
    const tx = database.transaction(TABLES.CALENDAR, 'readwrite');
    const store = tx.objectStore(TABLES.CALENDAR);

    await new Promise((resolve, reject) => {
      const request = store.put({
        id: 'main',
        data: settings,
        timestamp: Date.now()
      });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });

    console.log('[persist-storage] Calendar settings saved to IndexedDB');
  } catch (err) {
    console.error('[persist-storage] Error saving calendar settings:', err && err.message);
  }
}

/**
 * Retrieve calendar settings from IndexedDB
 * @returns {Promise<Object|null>}
 */
async function getCalendarSettings() {
  try {
    const database = await initDB();
    const tx = database.transaction(TABLES.CALENDAR, 'readonly');
    const store = tx.objectStore(TABLES.CALENDAR);

    return new Promise((resolve, reject) => {
      const request = store.get('main');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          console.log('[persist-storage] Calendar settings loaded from IndexedDB (age:', Date.now() - result.timestamp, 'ms)');
          resolve(result.data);
        } else {
          resolve(null);
        }
      };
    });
  } catch (err) {
    console.error('[persist-storage] Error reading calendar settings:', err && err.message);
    return null;
  }
}

/**
 * Get age of cached data in milliseconds
 * @param {'timetable'|'offsets'} type - Type of data
 * @returns {Promise<number|null>} Age in milliseconds, or null if not cached
 */
async function getCacheAge(type) {
  try {
    const database = await initDB();
    const tx = database.transaction(type === 'timetable' ? TABLES.TIMETABLE : TABLES.OFFSETS, 'readonly');
    const store = tx.objectStore(type === 'timetable' ? TABLES.TIMETABLE : TABLES.OFFSETS);
    
    return new Promise((resolve, reject) => {
      const request = store.get('main');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          resolve(Date.now() - result.timestamp);
        } else {
          resolve(null);
        }
      };
    });
  } catch (err) {
    console.error('[persist-storage] Error getting cache age:', err && err.message);
    return null;
  }
}

/**
 * Clear all cached data
 * @returns {Promise<void>}
 */
async function clearCache() {
  try {
    const database = await initDB();
    
    for (const tableName of Object.values(TABLES)) {
      const tx = database.transaction(tableName, 'readwrite');
      const store = tx.objectStore(tableName);
      
      await new Promise((resolve, reject) => {
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    }
    
    console.log('[persist-storage] Cache cleared');
  } catch (err) {
    console.error('[persist-storage] Error clearing cache:', err && err.message);
  }
}
