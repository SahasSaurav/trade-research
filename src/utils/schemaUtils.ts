/**
 * Cleans JSON schema to be compatible with Google Generative AI API
 * Removes unsupported properties like $schema, additionalProperties, and array type values
 */
function cleanSchemaForGemini(schema: Record<string, unknown>): Record<string, unknown> {
	const cleaned = JSON.parse(JSON.stringify(schema));

	function removeUnsupported(obj: any): void {
		if (!obj || typeof obj !== "object") return;

		// Remove unsupported properties
		delete obj.$schema;
		delete obj.additionalProperties;

		// Handle type field - if it's an array, remove it (Gemini doesn't support type: ["string", "null"])
		if (Array.isArray(obj.type)) {
			delete obj.type;
		}

		// Recursively clean all nested objects and arrays
		for (const key in obj) {
			if (Object.prototype.hasOwnProperty.call(obj, key)) {
				const value = obj[key];

				if (value && typeof value === "object") {
					if (Array.isArray(value)) {
						// Clean each item in arrays
						value.forEach((item) => {
							if (item && typeof item === "object") {
								removeUnsupported(item);
							}
						});
					} else {
						// Recursively clean nested objects
						removeUnsupported(value);
					}
				}
			}
		}
	}

	removeUnsupported(cleaned);
	return cleaned;
}

export { cleanSchemaForGemini };
