import Link from "next/link";

export default function RunNotFound() {
  return (
    <div className="mx-auto w-full max-w-[76rem] flex-1 px-4 pt-10 pb-20 sm:px-8 sm:pt-14">
      <div className="md:pl-16">
        <h1 className="text-[2.125rem] leading-[1.15] font-normal tracking-[-0.01em] sm:text-[2.75rem]">Run not found</h1>
        <p className="mt-4 max-w-[62ch] text-lg leading-[1.6] text-muted">
          There is no saved run at this address for your account.{" "}
          <Link href="/runs" className="link text-ink">
            See your runs
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
