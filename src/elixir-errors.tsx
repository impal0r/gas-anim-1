import { create } from "zustand";

// Enable better error messages by generating a stack trace
// (in my version of node, I only figured out how to get unstructured string traces)
function __stack(): string | undefined {
    let err = new Error;
    Error.captureStackTrace(err);
    return err.stack;
}

// Function which returns a string containing the
// function name, file path, and source line number of where it was called
// Optionally, setting stackDepth to 1 or more will further unwrap the stack
// that number of times, so e.g. __funcFileAndLine(1) returns the
// location of the function call one layer up, stackDepth=2 for 2 layers up, etc.
// Note: this function should only really be used in development mode, not in production
function __funcFileAndLine(stackDepth: number = 0): string {
    let stack = __stack()!;
    let stack_lines = stack.split('\n');
    // for (let i = 2; i < stack_lines.length; i++) {
    //   let line = stack_lines[i];
    let line = stack_lines[stackDepth + 2];
    let _ = line.split('@');
    let funcname = _[0], location = _[1];
    _ = location.split('?');
    let fileURL = _[0], lastPart = _[1];
    let filePath = fileURL.slice(7).split('/').slice(1).join('/');
    let lineNum = lastPart.split(':')[1];
    //   }
    return funcname + ", " + filePath + ', line ' + lineNum;
}

// Define a global error state using Zustand
interface ErrorState {
    hasError: boolean;
    message: string;
    setError: (message: string) => void;
}
const ErrorStateStore = create<ErrorState>((set) => ({
    hasError: false,
    message: '',
    setError: (message: string) => set({ hasError: true, message })
}))

// Function to soft-throw an error (the ErrorBox should be present in the App)
export function showError(message: string) {
    ErrorStateStore.getState().setError(message);
}

// Assert function which is only triggered in debug mode
export function debugAssert(condition: boolean, message: string) {
    if (process.env.NODE_ENV === 'development' && !condition) {
        // get trace of the line that called debugAssert (not the place in debugAssert itself)
        // hence argument to __funcFileAndLine is stackDepth=1, instead of default 0
        let trace: string = __funcFileAndLine(1);
        showError(`Assertion failed: ${message} \n ${trace}`);
    }
}  

// HTML popup element that will display an error - there should be exactly one somewhere in the App
// (Note: currently, putting too much text in the message might make it impossible to close)
export function ErrorBox() {
    const { hasError, message } = ErrorStateStore.getState();
    if (!hasError) return null;
    return (
      <div className="fixed top-0 left-0 w-full h-full bg-black/50 flex items-center justify-center" id="error-popup">
        <div className="bg-red-400 text-black p-4 rounded-lg flex flex-col gap-2">
          <div className="text-lg font-bold">Error</div>
          <p className="whitespace-pre-wrap">{message}</p>
          <p className="w-min text-black hover:text-gray-500 underline"
             onClick={() => {document.getElementById("error-popup")!.style.display = "none"}}>Close</p>
        </div>
      </div>
    );
  }