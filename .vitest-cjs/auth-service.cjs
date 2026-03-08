"use strict";
Object.defineProperty(exports, "__esModule", {
	value: true,
});
Object.defineProperty(exports, "AuthService", {
	enumerable: true,
	get: function () {
		return AuthService;
	},
});
const _common = require("@nestjs/common");
const _authmoduledefinitionts = require("./auth-module-definition.cjs");
function _ts_decorate(decorators, target, key, desc) {
	var c = arguments.length,
		r =
			c < 3
				? target
				: desc === null
					? (desc = Object.getOwnPropertyDescriptor(target, key))
					: desc,
		d;
	if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
		r = Reflect.decorate(decorators, target, key, desc);
	else
		for (var i = decorators.length - 1; i >= 0; i--)
			if ((d = decorators[i]))
				r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
	return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
	if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
		return Reflect.metadata(k, v);
}
function _ts_param(paramIndex, decorator) {
	return function (target, key) {
		decorator(target, key, paramIndex);
	};
}
class AuthService {
	options;
	constructor(options) {
		this.options = options;
	}
	/**
	 * Returns the API endpoints provided by the auth instance
	 */ get api() {
		return this.options.auth.api;
	}
	/**
	 * Returns the complete auth instance
	 * Access this for plugin-specific functionality
	 */ get instance() {
		return this.options.auth;
	}
}
AuthService = _ts_decorate(
	[
		_ts_param(
			0,
			(0, _common.Inject)(_authmoduledefinitionts.MODULE_OPTIONS_TOKEN),
		),
		_ts_metadata("design:type", Function),
		_ts_metadata("design:paramtypes", [
			typeof AuthModuleOptions === "undefined" ? Object : AuthModuleOptions,
		]),
	],
	AuthService,
);

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy90aGFsbGVzL0Rlc2t0b3AvcHJvZ3JhbW1pbmctc3R1ZmYvcGVyc29uYWwvbmVzdGpzLWJldHRlci1hdXRoL3NyYy9hdXRoLXNlcnZpY2UudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgSW5qZWN0IH0gZnJvbSBcIkBuZXN0anMvY29tbW9uXCI7XG5pbXBvcnQgdHlwZSB7IEF1dGggfSBmcm9tIFwiYmV0dGVyLWF1dGhcIjtcbmltcG9ydCB7XG5cdHR5cGUgQXV0aE1vZHVsZU9wdGlvbnMsXG5cdE1PRFVMRV9PUFRJT05TX1RPS0VOLFxufSBmcm9tIFwiLi9hdXRoLW1vZHVsZS1kZWZpbml0aW9uLnRzXCI7XG5cbi8qKlxuICogTmVzdEpTIHNlcnZpY2UgdGhhdCBwcm92aWRlcyBhY2Nlc3MgdG8gdGhlIEJldHRlciBBdXRoIGluc3RhbmNlXG4gKiBVc2UgZ2VuZXJpY3MgdG8gc3VwcG9ydCBhdXRoIGluc3RhbmNlcyBleHRlbmRlZCBieSBwbHVnaW5zXG4gKi9cbmV4cG9ydCBjbGFzcyBBdXRoU2VydmljZTxUIGV4dGVuZHMgeyBhcGk6IFRbXCJhcGlcIl0gfSA9IEF1dGg+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QEluamVjdChNT0RVTEVfT1BUSU9OU19UT0tFTilcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IEF1dGhNb2R1bGVPcHRpb25zPFQ+LFxuXHQpIHt9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIEFQSSBlbmRwb2ludHMgcHJvdmlkZWQgYnkgdGhlIGF1dGggaW5zdGFuY2Vcblx0ICovXG5cdGdldCBhcGkoKTogVFtcImFwaVwiXSB7XG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5hdXRoLmFwaTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjb21wbGV0ZSBhdXRoIGluc3RhbmNlXG5cdCAqIEFjY2VzcyB0aGlzIGZvciBwbHVnaW4tc3BlY2lmaWMgZnVuY3Rpb25hbGl0eVxuXHQgKi9cblx0Z2V0IGluc3RhbmNlKCk6IFQge1xuXHRcdHJldHVybiB0aGlzLm9wdGlvbnMuYXV0aDtcblx0fVxufVxuIl0sIm5hbWVzIjpbIkF1dGhTZXJ2aWNlIiwib3B0aW9ucyIsImFwaSIsImF1dGgiLCJpbnN0YW5jZSJdLCJtYXBwaW5ncyI6Ijs7OzsrQkFXYUE7OztlQUFBQTs7O3dCQVhVO3dDQUtoQjs7Ozs7Ozs7Ozs7Ozs7O0FBTUEsTUFBTUE7O0lBQ1osWUFDQyxBQUNpQkMsT0FBNkIsQ0FDN0M7YUFEZ0JBLFVBQUFBO0lBQ2Y7SUFFSDs7RUFFQyxHQUNELElBQUlDLE1BQWdCO1FBQ25CLE9BQU8sSUFBSSxDQUFDRCxPQUFPLENBQUNFLElBQUksQ0FBQ0QsR0FBRztJQUM3QjtJQUVBOzs7RUFHQyxHQUNELElBQUlFLFdBQWM7UUFDakIsT0FBTyxJQUFJLENBQUNILE9BQU8sQ0FBQ0UsSUFBSTtJQUN6QjtBQUNEIn0=
