/**
 * @fileoverview Rule to flag non-camelcased identifiers
 * @author Nicholas C. Zakas
 */

"use strict";

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
    meta: {
        docs: {
            description: "enforce camelcase naming convention",
            category: "Stylistic Issues",
            recommended: false
        },

        schema: [
            {
                type: "object",
                definitions: {
                    RegExp: {
                        type: "object",
                        required: [ "regex" ],
                        additionalProperties: false,
                        properties: {
                            regex: {
                                type: "object",
                                required: [ "pattern" ],
                                additionalProperties: false,
                                properties: {
                                    pattern: {
                                        type: "string"
                                    },
                                    flags: {
                                        type: "string"
                                    }
                                }
                            }
                        }
                    },
                    StringOrRegExp: {
                        oneOf: [
                            { type: "string" },
                            { $ref: "#/definitions/RegExp" }
                        ]
                    },
                    ArrayOfStringOrRegExp: {
                        type: "array",
                        items: { $ref: "#/definitions/StringOrRegExp" }
                    }
                },
                properties: {
                    properties: {
                        enum: ["always", "never"]
                    },
                    allowedPrefixes: { $ref: "#/definitions/ArrayOfStringOrRegExp" },
                    allowedSuffixes: { $ref: "#/definitions/ArrayOfStringOrRegExp" },
                    exceptions: { $ref: "#/definitions/ArrayOfStringOrRegExp" }
                },
                additionalProperties: false
            }
        ]
    },

    create: function(context) {

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        // contains reported nodes to avoid reporting twice on destructuring with shorthand notation
        var reported = [];

        /**
         * Checks if a string contains an underscore and isn't all upper-case
         * @param {String} name The string to check.
         * @returns {boolean} if the string is underscored
         * @private
         */
        function isUnderscored(name) {

            // if there's an underscore, it might be A_CONSTANT, which is okay
            return name.indexOf("_") > -1 && name !== name.toUpperCase();
        }

        /**
         * Reports an AST node as a rule violation.
         * @param {ASTNode} node The node to report.
         * @returns {void}
         * @private
         */
        function report(node) {
            if (reported.indexOf(node) < 0) {
                reported.push(node);
                context.report(node, "Identifier '{{name}}' is not in camel case.", { name: node.name });
            }
        }

        /**
         * Convert an array of String or ESTree RegExpLiteral values into an array of String or
         * RegExp values.
         * @param {ArrayOfStringOrRegExp} [iv] An array of strings and objects.
         * @returns {Array} iv with ESTree RegExpLiterals replaced by RegExp instances, or undefined
         * if iv absent.
         */
        function processArrayOfStringOrRegExp(iv) {
            var rv;

            if (Array.isArray(iv)) {
                rv = iv.map(function(elt) {

                    // ESTree RegExpLiteral ok
                    if (typeof elt === "object") {
                        return new RegExp(elt.regex.pattern, elt.regex.flags || "");
                    }

                    // string values OK
                    return elt;
                });
            }
            return rv;
        }

        /**
         * Return undefined or the start of the unprefixed value.
         * @param {String} value A string that may or may not start with prefix
         * @param {String} prefix A string that may appear at the start of value
         * @returns {Number} The offset into value following prefix, or -1 if value does not start with prefix.
         */
        function startAfterStringPrefix(value, prefix) {
            var start = prefix.length;

            if (start >= value.length) {
                return -1;
            }
            if (value.substr(0, prefix.length) !== prefix) {
                return -1;
            }
            return start;
        }

        /**
         * Return undefined or the start of the unprefixed value.
         * @param {String} value A string that may or may not start with prefix
         * @param {RegExp} prefix A regular expression that may appear at the start of value
         * @returns {Number} The offset into value following prefix, or -1 if value does not start with prefix.
         */
        function startAfterRegExpPrefix(value, prefix) {
            var match = prefix.exec(value);

            if (!match) {
                return -1;
            }
            if (match.index !== 0) {
                return -1;
            }
            return match[0].length;
        }

        /**
         * Return undefined or the end of the unsuffixed value.
         * @param {String} value A string that may or may not end with suffix
         * @param {String} suffix A string that may appear at the end of value
         * @returns {Number} The offset into value where the suffix begins, or -1 if value does not end with suffix.
         */
        function endBeforeStringSuffix(value, suffix) {
            var ends = value.length - suffix.length;

            if (ends <= 0) {
                return -1;
            }
            if (value.substr(ends) !== suffix) {
                return -1;
            }
            return ends;
        }

        /**
         * Return undefined or the end of the unsuffixed value.
         * @param {String} value A string that may or may not end with suffix
         * @param {RegExp} suffix A regular expression that may appear at the end of value
         * @returns {Number} The offset into value where the suffix begins, or -1 if value does not end with suffix.
         */
        function endBeforeRegExpSuffix(value, suffix) {
            var match = suffix.exec(value);

            if (!match) {
                return -1;
            }
            var ends = match.index;

            if ((ends + match[0].length) !== value.length) {
                return -1;
            }
            return ends;
        }

        /**
         * Strip at most one prefix permitted text from the identifier.
         *
         * This transformation cannot change an acceptable identifier
         * into an unacceptable identifier so we can continue with the
         * normal verification of whatever it produces.
         *
         * @param {String} value An identifier
         * @param {Array} allowed An array of strings and regular expressions allowed as prefixes.
         * @returns {String} the checkable remainder of the identifier.
         */
        function removePrefix(value, allowed) {
            var i;
            var len = allowed.length;

            for (i = 0; i < len; ++i) {
                var prefix = allowed[i];
                var start;

                if (typeof prefix === "string") {
                    start = startAfterStringPrefix(value, prefix);
                } else {
                    start = startAfterRegExpPrefix(value, prefix);
                }
                if (start >= 0) {
                    value = value.substr(start);
                    break;
                }
            }
            return value;
        }

        /**
         * Strip at most one suffix permitted text from the identifier.
         *
         * This transformation cannot change an acceptable identifier
         * into an unacceptable identifier so we can continue with the
         * normal verification of whatever it produces.
         *
         * @param {String} value An identifier
         * @param {Array} allowed An array of strings and regular expressions allowed as suffixes.
         * @returns {String} the checkable remainder of the identifier.
         */
        function removeSuffix(value, allowed) {
            var i;
            var len = allowed.length;

            for (i = 0; i < len; ++i) {
                var suffix = allowed[i];
                var ends;

                if (typeof suffix === "string") {
                    ends = endBeforeStringSuffix(value, suffix);
                } else {
                    ends = endBeforeRegExpSuffix(value, suffix);
                }
                if (ends >= 0) {
                    value = value.substr(0, ends);
                    break;
                }
            }
            return value;
        }

        /**
         * Return whether the identifier is an exception to the rule.
         *
         * @param {String} value An identifier
         * @param {Array} allowed An array of strings and regular expressions that identify exceptions.
         * @returns {Boolean} `true` iff the value is an exception
         */
        function matchExceptions(value, allowed) {
            var i;
            var len = allowed.length;
            var isException = false;

            for (i = 0; (i < len) && !isException; ++i) {
                var exception = allowed[i];

                if (typeof exception === "string") {
                    isException = (exception === value);
                } else {
                    isException = exception.test(value);
                }
            }
            return isException;
        }

        var options = context.options[0] || {},
            properties = options.properties || "",
            allowedPrefixes = processArrayOfStringOrRegExp(options.allowedPrefixes),
            allowedSuffixes = processArrayOfStringOrRegExp(options.allowedSuffixes),
            exceptions = processArrayOfStringOrRegExp(options.exceptions);

        if (properties !== "always" && properties !== "never") {
            properties = "always";
        }

        /**
         * Returns the subsequence of the name that is subject to the style check.
         * @param {String} name The original identifier value
         * @returns {String} The identifier that should be checked
         */
        function checkableName(name) {
            name = name.replace(/^_+|_+$/g, "");
            if (allowedPrefixes) {
                name = removePrefix(name, allowedPrefixes);
            }
            if (allowedSuffixes) {
                name = removeSuffix(name, allowedSuffixes);
            }
            return name;
        }

        return {

            Identifier: function(node) {

                /*
                 * Leading and trailing underscores are commonly used to flag
                 * private/protected identifiers, strip them
                 */
                var name = checkableName(node.name),
                    effectiveParent = (node.parent.type === "MemberExpression") ? node.parent.parent : node.parent;

                // Skip identifiers that are excluded from checks
                if (exceptions && matchExceptions(name, exceptions)) {
                    return;
                }

                // MemberExpressions get special rules
                if (node.parent.type === "MemberExpression") {

                    // "never" check properties
                    if (properties === "never") {
                        return;
                    }

                    // Always report underscored object names
                    if (node.parent.object.type === "Identifier" &&
                            node.parent.object.name === node.name &&
                            isUnderscored(name)) {
                        report(node);

                    // Report AssignmentExpressions only if they are the left side of the assignment
                    } else if (effectiveParent.type === "AssignmentExpression" &&
                            isUnderscored(name) &&
                            (effectiveParent.right.type !== "MemberExpression" ||
                            effectiveParent.left.type === "MemberExpression" &&
                            effectiveParent.left.property.name === node.name)) {
                        report(node);
                    }

                // Properties have their own rules
                } else if (node.parent.type === "Property") {

                    // "never" check properties
                    if (properties === "never") {
                        return;
                    }

                    if (node.parent.parent && node.parent.parent.type === "ObjectPattern" &&
                            node.parent.key === node && node.parent.value !== node) {
                        return;
                    }

                    if (isUnderscored(name) && effectiveParent.type !== "CallExpression") {
                        report(node);
                    }

                // Report anything that is underscored that isn't a CallExpression
                } else if (isUnderscored(name) && effectiveParent.type !== "CallExpression") {
                    report(node);
                }
            }

        };

    }
};
