const debug = require("debug")("textlint:text-fixer");
import SourceCode from "../rule/source-code";
const BOM = "\uFEFF";

/**
 * Compares items in a messages array by line and column.
 * @param {TextLintMessage} a The first message.
 * @param {TextLintMessage} b The second message.
 * @returns {int} -1 if a comes before b, 1 if a comes after b, 0 if equal.
 * @private
 */
function compareMessagesByLocation(a, b) {
    const lineDiff = a.line - b.line;

    if (lineDiff === 0) {
        return a.column - b.column;
    } else {
        return lineDiff;
    }
}

/**
 * Utility for apply fixes to source code.
 * @constructor
 */
function SourceCodeFixer() {
    Object.freeze(this);
}

/**
 * Applies the fixes specified by the messages to the given text. Tries to be
 * smart about the fixes and won't apply fixes over the same area in the text.
 * @param {SourceCode} sourceCode The source code to apply the changes to.
 * @param {TextLintMessage[]} messages The array of messages reported by ESLint.
 * @returns {Object} An object containing the fixed text and any unfixed messages.
 */
SourceCodeFixer.applyFixes = (sourceCode, messages) => {
    debug("Applying fixes");
    const text = sourceCode.text;
    // TODO: we collect applied messages.
    // As as result, show diff
    const remainingMessages = [];
    const applyingMessages = [];
    const fixes = [];
    let lastFixPos = text.length + 1;
    let prefix = (sourceCode.hasBOM ? BOM : "");
    messages.forEach(problem => {
        if (problem.data && problem.data.hasOwnProperty("fix")) {
            fixes.push(problem);
        } else {
            remainingMessages.push(problem);
        }
    });

    if (fixes.length) {
        debug("Found fixes to apply");

        // sort in reverse order of occurrence
        fixes.sort((a, b) => {
            if (a.data.fix.range[1] <= b.data.fix.range[0]) {
                return 1;
            } else {
                return -1;
            }
        });

        // split into array of characters for easier manipulation
        const chars = text.split("");

        fixes.forEach(problem => {
            // pickup fix range
            const fix = problem.data.fix;
            let start = fix.range[0];
            const end = fix.range[1];
            let insertionText = fix.text;

            if (end < lastFixPos) {
                if (start < 0) {
                    // Remove BOM.
                    prefix = "";
                    start = 0;
                }
                if (start === 0 && insertionText[0] === BOM) {
                    // Set BOM.
                    prefix = BOM;
                    insertionText = insertionText.slice(1);
                }

                const replacedChars = chars.splice(start, end - start, insertionText);
                lastFixPos = start;
                const copyOfMessage = JSON.parse(JSON.stringify(problem));
                copyOfMessage.data.fix = {
                    range: [start, start + insertionText.length],
                    text: replacedChars.join("")
                };
                applyingMessages.push(copyOfMessage);
            } else {
                remainingMessages.push(problem);
            }
        });

        return {
            fixed: true,
            applyingMessages: applyingMessages.reverse(),
            remainingMessages: remainingMessages.sort(compareMessagesByLocation),
            output: prefix + chars.join("")
        };
    } else {
        debug("No fixes to apply");
        return {
            fixed: false,
            applyingMessages,
            remainingMessages,
            output: prefix + text
        };
    }
};

/**
 * Revert text using applied fixes.
 * This method used the result of `SourceCodeFixer.applyFixes`,
 * @param {SourceCode} sourceCode The source code to apply the changes to.
 * @param {TextLintMessage[]} applyingMessages The array of applyingMessages reported by SourceCodeFixer#applyFixes
 * @returns {string} An object containing the fixed text and any unfixed messages.
 */
SourceCodeFixer.revertFixes = (sourceCode, applyingMessages) => {
    debug("Restore applied fixes");
    let text = sourceCode.text;
    applyingMessages.forEach(message => {
        const newSource = new SourceCode({
            text,
            ast: sourceCode.ast, // it's dummy
            ext: sourceCode.ext,
            filePath: sourceCode.filePath
        });
        const result = SourceCodeFixer.applyFixes(newSource, [message]);
        text = result.output;
    });
    return text;
};

export default SourceCodeFixer;