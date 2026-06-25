declare module 'mssql' {
    export interface config {
        server: string;
        database: string;
        user?: string;
        password?: string;
        driver?: string;
        options?: {
            encrypt?: boolean;
            trustServerCertificate?: boolean;
            enableArithAbort?: boolean;
            trustedConnection?: boolean;
        };
        connectionTimeout?: number;
        requestTimeout?: number;
        connectionString?: string;
    }

    export class ConnectionPool {
        constructor(config: config | string);
        connect(): Promise<ConnectionPool>;
        close(): Promise<void>;
        request(): Request;
    }

    export class Request {
        constructor(transaction?: Transaction | ConnectionPool);
        input(name: string, value: any): Request;
        query(command: string): Promise<{ recordset: any[]; rowsAffected: number[] }>;
    }

    export class Transaction {
        constructor(pool: ConnectionPool);
        begin(): Promise<void>;
        commit(): Promise<void>;
        rollback(): Promise<void>;
    }

    export default {
        ConnectionPool,
        Request,
        Transaction
    };
}
