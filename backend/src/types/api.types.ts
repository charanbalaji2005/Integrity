export interface ApiResponse<T = unknown> {
	success: boolean;
	message: string;
	data?: T;
}

export interface PaginatedResponse<T = unknown> extends ApiResponse<T[]> {
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}
