interface Window {
  loadPyodide?: (options: { indexURL?: string; fullStdLib?: boolean }) => Promise<any>;
  ort?: any;
}
