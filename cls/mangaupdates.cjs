'use strict';
const __root = require('app-root-path').path;
const path = require('path');

/** @type {EnumsConstructor} - Enums class Static Elements. */
const Enums = require(path.join(__root, 'enums', 'mangalist.cjs'));

/** * Axios import with type safety in a CommonJS environment.
 *
 * Explanation:
 * - `require('axios')` returns the entire module namespace.
 * - The default export (AxiosStatic) includes methods like `put`, `get`, `create`, etc.
 * - Depending on the environment, the Axios instance may be under `.default` or directly on the module.
 * - TypeScript distinguishes between the module namespace and AxiosStatic type,
 *   causing incompatibility errors when assigning directly.
 *
 * To safely handle both cases and satisfy TypeScript:
 * - Use a double type cast: first cast to `unknown` to bypass strict checks,
 *   then cast to `AxiosStatic` to enable IntelliSense and type checking.
 *
 * This pattern avoids using `// @ts-ignore` while keeping type safety and
 * works correctly in environments mixing CommonJS and ES Modules.
 */
const axiosModule = require('axios');
/** @type {import('axios').AxiosStatic} */
const axios = /** @type {import('axios').AxiosStatic} */ (axiosModule.default ?? axiosModule);

const http = require('http');
const https = require('https');

/** @type {import('http').Agent} */
const httpAgent = new http.Agent({ keepAlive: true });

/** @type {import('https').Agent} */
const httpsAgent = new https.Agent({ keepAlive: true });

/**
 * @type {import('axios').AxiosRequestConfig}
 */
const config = {
    httpAgent,
    httpsAgent,
};

const redis = require('redis');
/** @typedef {import('redis').RedisClientType} RedisClientType */
/** @typedef {import('@redis/json/dist/lib/commands').RedisJSON} RedisJSON */

const template = require('string-placeholder');
const { type } = require('os');
const { wait } = require(path.join(__root, 'utils', 'tools.cjs'));

/** @type {UtilsConstructor} - Utils Class static members. */
const Utils = require(path.join(__root, 'cls', 'utils.cjs'));

class MangaUpdates {
    /**
     * Constructor for MangaList class.
     * @param {!MangaUpdatesParameters} args - Constructor parameters.
     */
    constructor(args) {
        // Destructure the arguments
        const { settings, redisclient, bearerToken } = args;

        /** @type {MangaUpdatesSettings} - Cache of the mangaupdates settings. */
        this.settings = settings;

        /** @type {RedisClientType} - Cache of the mangaupdates settings. */
        this.redisclient = redisclient;

        /** @type {string|undefined} - References the manga object for handling manga related operations. */
        this.bearerToken = bearerToken;
    }

    /**
     * Factory function to perform initialization steps and return an instance of MangaUpdates.
     * @param {SettingsClass} settings - The reference to the Settings instance to be used in MangaUpdates initialization.
     * @return {Promise<MangaUpdates>} A promise that resolves to an instance of MangaUpdates or null if initialization fails.
     */
    static async init(settings) {
        // Get the reference to the manga-list/mangaupdates settings
        //
        /** @type {SettingsMangaList} - The manga-list settings. */
        const mangalist = settings.mangalist;

        /** @type {SettingdMangaUpdates} - The mangaupdates settings. */
        const mangaupdates = settings.mangaupdates;

        // Make sure that the database settings are available.
        if (!mangalist || !mangalist.database || !mangalist.database.directoryPathName)
            throw new Error('(init) manga-list settings not found or database path is missing.');

        // Build settings for MangaUpdates.
        /** @type {MangaUpdatesSettings} - Cache of the manga-list/mangalist/hakuneko settings. */
        const _settings = JSON.parse(JSON.stringify(
            {
                api: mangaupdates.api, // The mangaupdates API entries.
                credentials: mangaupdates.credentials, // The mangaupdates credentials entries.
                redis: settings.redis // The redis settings
            }
        ));

        // Get Redis host and port from settings
        const redisHost = _settings.redis.environment[_settings.redis.default];

        // Creat a Redis client connection
        const _redisclient = redis.createClient({
            url: `redis://${redisHost.host}:${redisHost.port}`,
        });

        // Build the MangaUpdates parameters object
        /** @type {MangaUpdatesParameters} - Parameters for initializing MangaUpdatesParameters. */
        const MangaUpdatesParameters = { settings: _settings, redisclient: _redisclient };

        /** @type {MangaUpdates} - Instance of the Hakuneko class. */
        let mangaupdatesInstance = Object.create(null);;
        try {
            // Create a new instance of MangaUpdatesParameters with the initialized database and settings
            mangaupdatesInstance = new MangaUpdates(MangaUpdatesParameters);
        } catch (error) {
            throw new Error(`(init) Error creating MangaUpdates instance: ${error}`);
        }

        // Get MangaUpdate bearer token
        await mangaupdatesInstance.getToken();

        // Return a new instance of MangaUpdates with the initialized database and settings
        return mangaupdatesInstance;
    }

    /** Get refresh status
     * @param {boolean} [value] - Value to set refresh status to.
     * @returns {Promise<boolean>}
     * @example
     *      const refreshRequired = await this.refresh();
     * @async
     */
    async refresh(value) {
        /** Default response no refresh: false
         * If true, override the cache
         * required: @type {boolean} - Is refresh required. */
        let required = false;

        // Check if redis connection is open, if not, establish it
        if (!this.redisclient.isOpen)
            await this.redisclient.connect();

        if (value === undefined) {
            // No value provided, try to read refresh value
            // Call Redis get value
            const response = await this.getRedisValue("refresh");

            // Convert to boolean
            required = Utils.parseBoolean(response);
        }
        else {
            // Value is provided, set value for refresh
            // Call Redis get value
            await this.setRedisValue("refresh", String(value).toString());
        }

        return required;
    }

    /** Get an authetication token from Manga Updates
     * @param {boolean} [refresh] - If true, force obtain a new token.
     * @returns {Promise<string>} The Manga Updates bearer token.
     * @async
     */
    async getToken(refresh = false) {
        /** @type {string} - Manga Updates API bearer token. */
        let _bearerToken = '';

        // Read the cached bearer token if not forced refresh
        if (!refresh) {
            // Call Redis get value
            const response = await this.getRedisValue("bearerToken");

            // Assign
            if (response)
                _bearerToken = response.toString();
        }

        // Get a new token if no cached bearer token exists or if forced refresh
        if (!_bearerToken || refresh) {
            _bearerToken = await this._getToken();

            // Cache bearer token (for 12 Hours = 43200 = 12 * 60 * 60 seconds)
            await this.setRedisValue("bearerToken", _bearerToken, 43200);
        }

        this.bearerToken = _bearerToken;

        return _bearerToken;
    }

    /**
     * Retrieves a value from Redis by key.
     * @param {string} key - Redis key to retrieve the value from.
     * @returns {Promise<string|null>} - The stored value, or null if not found.
     * @async
     */
    async getRedisValue(key) {
        // Assign to local variable
        const redisClient = this.redisclient;

        // Check if redis connection is open, if not, establish it
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }

        try {
            const value = await redisClient.get(key);
            if (value === null) {
                console.warn(`(getRedisValue) No value found for key "${key}".`);
            }
            return value;
        } catch (error) {
            if (error instanceof Error) {
                console.error(`(getRedisValue) Redis error for key "${key}":`, error.message);
            } else {
                console.error(`(getRedisValue) Unknown error for key "${key}":`, error);
            }
            return null;
        }
    }

    /**
     * Stores a value in Redis under the specified key with optional TTL.
     * @param {string} key - Redis key to store the value under.
     * @param {string} value - Value to store in Redis.
     * @param {number} [ttl] - Optional time-to-live in seconds.
     * @returns {Promise<void>}
     * @async
     */
    async setRedisValue(key, value, ttl) {
        // Assign to local variable
        const redisClient = this.redisclient;

        // Build options for Redis call
        const options = ttl ? { EX: ttl } : undefined;

        // Check if redis connection is open, if not, establish it
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }

        try {
            const result = await redisClient.set(key, value, options);
            if (result !== 'OK') {
                console.warn(`(setRedisValue) Failed to set key "${key}" in Redis.`);
            }
        } catch (error) {
            if (error instanceof Error) {
                console.error(`(setRedisValue) Redis error for key "${key}":`, error.message);
            } else {
                console.error(`(setRedisValue) Unknown error for key "${key}":`, error);
            }
        }
    }

    /**
     * Get JSON value for specified key in Redis cache
     * @param {string} key - Key to reference JSON value stored in Redis cache.
     * @returns {Promise<any>}
     * @async
     */
    async getRedisJSONValue(key) {
        // Assign to local variable
        const redisClient = this.redisclient;

        // Check if redis connection is open, if not, establish it
        if (!redisClient.isOpen)
            await redisClient.connect();

        /** @type {RedisJSON} */
        let response = Object.create(null);

        try {
            const value = await redisClient.json.get(key);
            if (value === null) {
                console.warn(`(getRedisJSONValue) No value found for key "${key}".`);
                return response;
            }

            // Assign the value to the response
            response = value;
        } catch (error) {
            if (error instanceof Error) {
                console.error(`(getRedisJSONValue) Redis error for key "${key}":`, error.message);
            } else {
                console.error(`(getRedisJSONValue) Unknown error for key "${key}":`, error);
            }
        }

        return response;
    }

    /**
     * Set JSON value for specified key in Redis cache
     * @param {string} key - Key to reference JSON value stored in Redis cache.
     * @param {any} value - Value to store in Redis cache.
     * @returns {Promise<void>}
     * @async
     */
    async setRedisJSONValue(key, value) {
        // Assign to local variable
        const redisClient = this.redisclient;

        // Check if redis connection is open, if not, establish it
        if (!redisClient.isOpen)
            await redisClient.connect();

        try {
            const result = await redisClient.json.set(key, '$', value)
            if (result !== 'OK') {
                console.warn(`(setRedisJSONValue) Failed to set key "${key}" in Redis.`);
            }
        } catch (error) {
            if (error instanceof Error) {
                console.error(`(setRedisJSONValue) Redis error for key "${key}":`, error.message);
            } else {
                console.error(`(setRedisJSONValue) Unknown error for key "${key}":`, error);
            }
        }

        return;
    }

    /**
     * Formats an error thrown by Axios or other sources.
     * @param {unknown} error - The error to format.
     * @param {string} context - Context label for the error message.
     * @returns {Error} A formatted Error instance.
     * @example
     *  try {
     *      const response = await axios.get(getSerieDetaailEndpoint, RequestConfig);
     *      responseData = response.data;
     *  } catch (error) {
     *      throw MangaUpdates.formatAxiosError(error, '[context]');
     *  }
     * @static
     */
    static formatAxiosError(error, context) {
        if (axios.isAxiosError(error)) {
            return new Error(`(${context}) Error: ${error.response?.data ?? error.message}`);
        } else if (error instanceof Error) {
            return new Error(`(${context}) Error: ${error.message}`);
        } else {
            return new Error(`(${context}) Unknown error occurred`);
        }
    }

    /**
     * Wrapper to get an authetication token from MangaUpdates API
     * @returns {Promise<string>} - The Manga Updates bearer token.
     * @private
     */
    async _getToken() {
        // Destructure of the arguments
        const { api, credentials } = this.settings;

        // If token exists, return it
        if (this.bearerToken) return this.bearerToken;

        /** @type {string} - MangaUpdates API bearer token. */
        let _bearerToken = '';

        // Request a authentication token
        //

        // Throw error if endpoint or endpoint template not configured.
        if (!api?.endPoints?.login || !api?.endPoints?.login?.template)
            throw new Error('(_getToken) Error: Missing login config');

        // Step 1: Build the Endpoint for Manga Updates API authentication
        /** @type {string} - Manga Updates API endpoint. */
        const loginEndpoint = template(api.endPoints.login.template, {
            baseUrl: api.baseUrl
        });

        // Step 2: Build Axios request configuration
        /** @type {import('axios').AxiosRequestConfig} - Axios request configuration. */
        const RequestConfig = {
            ...config, // Include the config defined above with the http and https agents
            headers: {
                'Content-Type': 'application/json'
            }
        };

        // Step 3: Use the endpoint and configuration and do a PUT request to the endpoint
        try {
            const response = await axios.put(loginEndpoint, credentials, RequestConfig);

            /** @type {string} - Bearer token from Manga Updates. */
            let token = response.data.context.session_token || null; // Adjust depending on actual response structure

            // Assign token
            _bearerToken = token;
        } catch (error) {
            throw MangaUpdates.formatAxiosError(error, '_getToken');
        }

        return _bearerToken;
    }

    /**
         * Get all series for a MangaUpdates user reading list.
         * @param {!MangaupdatesReadinglistType} id - MangaUpdates reading list ID.
         * @returns {Promise<MangaUpdatesReadingListSearchResultsEntry[]>}
         */
    async getListSeries(id) {
        // Get value for cache refresh required
        const refreshRequired = await this.refresh();

        // Get bearer token
        const bearerToken = await this.getToken();

        // Response data array to hold all series
        /** @type {MangaUpdatesReadingListSearchResultsEntry[]} */
        let responseData = [];

        // If refresh not required, get response from cache
        if (!refreshRequired) {
            responseData = await this.getRedisJSONValue(`getListSeries%%${id}`);

            // If cached data exist, return it
            if (responseData && responseData.length !== 0)
                return responseData;

            console.warn('(getListSeries) Warning: No cached data found or cache is empty, fetching from API.');
        }
        else {
            console.warn('(getListSeries) Warning: Refresh is required.');
        }

        /** @type {MangaupdatesReadinglistType} */
        let readingListID = id;

        // If no ID is provided, set id to the default
        if (typeof id === 'undefined' || id === null || isNaN(id))
            readingListID = Enums.MANGAUPDATES_READINGLIST_TYPE.READINGLIST; // Default MangaUpdates Reading List

        // get managaupdates settings
        const { api } = this.settings;

        if (!api || Object.keys(api).length === 0)
            return responseData;

        // Throw error if endpoint or endpoint template not configured.
        if (!api?.endPoints?.listSearch || !api?.endPoints?.listSearch?.template)
            throw new Error('(getListSeries) Error: Missing listSearch config');

        // Step 1: Build the Endpoint for Manga Updates API authentication
        /** @type {string} - Manga Updates API endpoint. */
        const listSearchEndpoint = template(api.endPoints.listSearch.template, {
            baseUrl: api.baseUrl,
            list_id: readingListID
        });

        // Step 2: Build Axios request configuration
        /** @type {import('axios').AxiosRequestConfig} - Axios request configuration. */
        const RequestConfig = {
            ...config, // Include the config defined above with the http and https agents
            headers: {
                Authorization: `Bearer ${bearerToken}`,
                'Content-Type': 'application/json'
            }
        };

        // Page counter and MAX records per page
        let page = 1;
        const PER_PAGE = api.endPoints.listSearch.optional?.per_page || 20;

        // Step 3: Cycle requesting for reading list in blocks of 500 records
        while (true) {
            // Step 3.1: Build request body based on page logic
            /** @type {MangaUpdatesReadingListSearchRequest} - Manga Updates list search request body. */
            const requestBody = {
                "page": page,
                "perpage": PER_PAGE
            };

            // Step 3.2: Use the token and configuration and do a GET request to the endpoint
            /** @type {MangaUpdatesReadingListSearchResultsEntry[]} */
            let data = [];

            try {
                const response = await axios.post(listSearchEndpoint, requestBody, RequestConfig);
                data = response.data?.results;
            } catch (error) {
                throw MangaUpdates.formatAxiosError(error, 'getListSeries');
            }

            // Once no data is recieved, exit the cycle
            if (!data || data.length === 0) {
                break;
            }

            // Merge received records into final list
            responseData.push(...data);
            console.log(`Received ${data.length} items on page ${page}`);

            // If less than PER_PAGE items are returned, it's the last page
            if (data.length < PER_PAGE) {
                break;
            }
            page++;

            // Throttle cycle (defaults to 500 milli-seconds)
            await wait(api.endPoints.listSearch.optional?.throttle || 500);
        }

        // If data returned, cache it
        if (responseData && responseData.length !== 0)
            await this.setRedisJSONValue(`getListSeries%%${id}`, responseData);

        // Set value for cache refresh required, only applies for one call
        if (refreshRequired) await this.refresh(false);

        // Step 4: Return reading list
        return responseData;
    }

    /**
     * Get series information by its ID.
     * @param {number} id - The ID of the series to retrieve details for.
     * @returns {Promise<MangaUpdatesReadingListSearchResultsEntry>} A promise that resolves to the series details.
     */
    async getListSeriesItem(id = 0) {
        // Get value for cache refresh required
        const refreshRequired = await this.refresh();

        // Get bearer token
        const bearerToken = await this.getToken();

        /** @type {MangaUpdatesReadingListSearchResultsEntry} */
        let responseData = Object.create(null);

        // get managaupdates settings
        const { api } = this.settings;

        // Throw error if endpoint or endpoint template not configured.
        if (!api?.endPoints?.listGetSeriesItem || !api?.endPoints?.listGetSeriesItem?.template)
            throw new Error('(getListSeriesItem) Error: Missing series config');

        // If refresh not required, get response from cache
        if (!refreshRequired) {
            responseData = await this.getRedisJSONValue(`getListSeriesItem%%${id}`);

            // If cached data exist, return it
            if (responseData && Object.keys(responseData).length !== 0)
                return (responseData);

            console.warn('(getListSeriesItem) Warning: No cached data found or cache is empty, fetching from API.');
        }
        else {
            console.warn('(getListSeriesItem) Warning: Refresh is required.');
        }

        // Step 1: Build the Endpoint for get series details
        /** @type {string} - Manga Updates endpoint. */
        const getListSeriesItemEndpoint = template(api.endPoints.series.template, {
            baseUrl: api.baseUrl,
            series_id: id
        });

        // Step 2: Build Axios request configuration
        /** @type {import('axios').AxiosRequestConfig} - Axios request configuration. */
        const RequestConfig = {
            ...config, // Include the config defined above with the http and https agents
            headers: {
                Authorization: `Bearer ${bearerToken}`,
                'Content-Type': 'application/json'
            }
        };

        // Step 3: Use the token and configuration and do a GET request to the endpoint
        try {
            const response = await axios.get(getListSeriesItemEndpoint, RequestConfig);
            responseData = {
                record: response.data,
                metadata: {
                    series: {
                        latest_chapter: NaN
                    },
                    user_rating: NaN
                }
            };
        } catch (error) {
            throw MangaUpdates.formatAxiosError(error, 'getListSeriesItem');
        }

        // If data returned, cache it
        if (responseData && Object.keys(responseData).length !== 0)
            await this.setRedisJSONValue(`getListSeriesItem%%${id}`, responseData);

        // Set value for cache refresh required, only applies for one call
        if (refreshRequired) await this.refresh(false);

        // Resolve the promise with the series details
        return (responseData);
    }

    /**
     * Get detailed information about a series by its ID.
     * @param {number} id - The ID of the series to retrieve details for.
     * @returns {Promise<MangaUpdatesSeriesResultEntry>} A promise that resolves to the series details.
     */
    async getSerieDetail(id = 0) {
        // Get value for cache refresh required
        const refreshRequired = await this.refresh();

        // Get bearer token
        const bearerToken = await this.getToken();

        /** @type {MangaUpdatesSeriesResultEntry} */
        let responseData = Object.create(null);

        // get managaupdates settings
        const { api } = this.settings;

        // Throw error if endpoint or endpoint template not configured.
        if (!api?.endPoints?.series || !api?.endPoints?.series?.template)
            throw new Error('(getSerieDetail) Error: Missing series config');

        // If refresh not required, get response from cache
        if (!refreshRequired) {
            responseData = await this.getRedisJSONValue(`getSerieDetail%%${id}`);

            // If cached data exist, return it
            if (responseData && Object.keys(responseData).length !== 0)
                return (responseData);

            console.warn('(getSerieDetail) Warning: No cached data found or cache is empty, fetching from API.');
        }
        else {
            console.warn('(getSerieDetail) Warning: Refresh is required.');
        }

        // Step 1: Build the Endpoint for get series details
        /** @type {string} - Manga Updates endpoint. */
        const getSerieDetaailEndpoint = template(api.endPoints.series.template, {
            baseUrl: api.baseUrl,
            series_id: id
        });

        // Step 2: Build Axios request configuration
        /** @type {import('axios').AxiosRequestConfig} - Axios request configuration. */
        const RequestConfig = {
            ...config, // Include the config defined above with the http and https agents
            headers: {
                Authorization: `Bearer ${bearerToken}`,
                'Content-Type': 'application/json'
            }
        };

        // Step 3: Use the token and configuration and do a GET request to the endpoint
        try {
            const response = await axios.get(getSerieDetaailEndpoint, RequestConfig);
            responseData = response.data;
        } catch (error) {
            throw MangaUpdates.formatAxiosError(error, 'getSerieDetail');
        }

        // If data returned, cache it
        if (responseData && Object.keys(responseData).length !== 0)
            await this.setRedisJSONValue(`getSerieDetail%%${id}`, responseData);

        // Set value for cache refresh required, only applies for one call
        if (refreshRequired) await this.refresh(false);

        // Resolve the promise with the series details
        return (responseData);
    }

    /**
     * Search for a serie in Manga Updates.
     * @param {MangaUpdatesSearchSeriesRequest} payload - The request body.
     * @returns {Promise<MangaUpdatesSearchSeriesResultEntry[]>} A promise that resolves to the series details.
     */
    async serieSearch(payload) {
        // Get value for cache refresh required
        const refreshRequired = await this.refresh();

        // Get bearer token
        const bearerToken = await this.getToken();

        /** @type {MangaUpdatesSearchSeriesResultEntry[]} */
        let responseData = Object.create(null);

        // get managaupdates settings
        const { api } = this.settings;

        // Throw error if endpoint or endpoint template not configured.
        if (!api?.endPoints?.seriesSearch || !api?.endPoints?.seriesSearch?.template)
            throw new Error('(serieSearch) Error: Missing seriesSearch config');

        // If refresh not required, get response from cache
        if (!refreshRequired) {
            responseData = await this.getRedisJSONValue(`serieSearch%%${Utils.folderNameToSlug(payload.search)}`);

            // If cached data exist, return it
            if (responseData && Object.keys(responseData).length !== 0)
                return (responseData);

            console.warn('(serieSearch) Warning: No cached data found or cache is empty, fetching from API.');
        }
        else {
            console.warn('(serieSearch) Warning: Refresh is required.');
        }

        // Step 1: Build the Endpoint for search series
        /** @type {string} - Manga Updates endpoint. */
        const getSerieSearchEndpoint = template(api.endPoints.seriesSearch.template, {
            baseUrl: api.baseUrl
        });

        // Step 2: Build Axios request configuration
        /** @type {import('axios').AxiosRequestConfig} - Axios request configuration. */
        const RequestConfig = {
            ...config, // Include the config defined above with the http and https agents
            headers: {
                Authorization: `Bearer ${bearerToken}`,
                'Content-Type': 'application/json'
            }
        };

        // Step 3: Use the token to call the protected endpoint
        try {
            const response = await axios.post(getSerieSearchEndpoint, payload, RequestConfig);
            responseData = response.data.results;
        } catch (error) {
            throw MangaUpdates.formatAxiosError(error, 'serieSearch');
        }

        // If data returned, cache it
        if (responseData && Object.keys(responseData).length !== 0)
            await this.setRedisJSONValue(`serieSearch%%${Utils.folderNameToSlug(payload.search)}`, responseData);

        // Set value for cache refresh required, only applies for one call
        if (refreshRequired) await this.refresh(false);

        // Resolve the promise with the series details
        return (responseData);
    }

    /**
     * Update series in reading list on MangaUpdates
     * @param {object[]} payload 
     * @returns {Promise<object>}
     */
    async updateListSeries(payload) {
        // Get bearer token
        const bearerToken = await this.getToken();

        /** @type {MangaUpdatesSearchSeriesResultEntry[]} */
        let responseData = Object.create(null);

        // get managaupdates settings
        const { api } = this.settings;

        // Throw error if endpoint or endpoint template not configured.
        if (!api?.endPoints?.listUpdateSeries || !api?.endPoints?.listUpdateSeries?.template)
            throw new Error('(updateListSeries) Error: Missing listUpdateSeries config');

        // Endpoint
        const updateListSeriesEndpoint = template(api.endPoints.listUpdateSeries.template, {
            baseUrl: api.baseUrl
        });

        // Step 2: Build Axios request configuration
        /** @type {import('axios').AxiosRequestConfig} - Axios request configuration. */
        const RequestConfig = {
            ...config, // Include the config defined above with the http and https agents
            headers: {
                Authorization: `Bearer ${bearerToken}`,
                'Content-Type': 'application/json'
            }
        };

        // Step 3: Use the token to call the protected endpoint
        try {
            const response = await axios.post(updateListSeriesEndpoint, payload, RequestConfig);
            responseData = response.data.results;
        } catch (error) {
            throw MangaUpdates.formatAxiosError(error, 'updateListSeries');
        }

        // Resolve the promise with the series details
        return (responseData);
    };

    /**
     * Add series to reading list on MangaUpdates
     * @param {Record<string, unknown>} payload 
     * @returns {Promise<object>}
     */
    async addListSeries(payload) {
        // Get bearer token
        const bearerToken = await this.getToken();

        /** @type {object} */
        let responseData = Object.create(null);

        // get managaupdates settings
        const { api } = this.settings;

        // Throw error if endpoint or endpoint template not configured.
        if (!api?.endPoints?.listAddSeries || !api?.endPoints?.listAddSeries?.template)
            throw new Error('(addListSeries) Error: Missing listAddSeries config');

        // Endpoint
        const addListSeriesEndpoint = template(api.endPoints.listAddSeries.template, {
            baseUrl: api.baseUrl
        });

        // Step 2: Build Axios request configuration
        /** @type {import('axios').AxiosRequestConfig} - Axios request configuration. */
        const RequestConfig = {
            ...config, // Include the config defined above with the http and https agents
            headers: {
                Authorization: `Bearer ${bearerToken}`,
                'Content-Type': 'application/json'
            }
        };

        // Step 3: Use the token to call the protected endpoint
        try {
            const response = await axios.post(addListSeriesEndpoint, payload, RequestConfig);
            responseData = response;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.warn('(addListSeries) Error:', ' [Status]:', error.response?.status, '[Message]', error.response?.data);
                error.response?.data?.context?.errors?.forEach(
                    /** @param {any} err */
                    (err) => {
                        console.warn('(addListSeries) Error [Context]:', err);
                    }
                );

                return { status: 200, data: error.response?.data };
            }
            else
                throw MangaUpdates.formatAxiosError(error, 'addListSeries');
        }

        // Resolve the promise with the series details
        return (responseData);
    };
};
module.exports = MangaUpdates;