export const repository = "https://github.com/snackbit/opendil";
export function sitePath(path = "") {
  return (
    import.meta.env.BASE_URL.replace(/\/$/, "") + "/" + path.replace(/^\//, "")
  );
}
