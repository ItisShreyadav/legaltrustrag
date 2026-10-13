import { AuthForm } from "./AuthForm";

/** Shared chrome for /login and /signup: a narrow column on the sections' left margin. */
export function AuthPage({ mode, title, lede }: { mode: "login" | "signup"; title: string; lede: string }) {
  return (
    <div className="mx-auto w-full max-w-[76rem] flex-1 px-4 pt-10 pb-20 sm:px-8 sm:pt-14">
      <div className="max-w-[28rem] md:ml-16">
        <h1 className="text-[2.125rem] leading-[1.15] font-normal tracking-[-0.01em] sm:text-[2.5rem]">{title}</h1>
        <p className="mt-3 text-lg leading-[1.6] text-muted">{lede}</p>
        <div className="mt-8 border-t border-rule pt-7">
          <AuthForm mode={mode} />
        </div>
      </div>
    </div>
  );
}
