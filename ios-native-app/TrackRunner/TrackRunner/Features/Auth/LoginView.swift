//
//  LoginView.swift
//  TrackRunner
//

import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var appState: AppState
    @FocusState private var focusedField: Field?

    @State private var email = ""
    @State private var password = ""
    @State private var isSigningIn = false
    @State private var errorMessage: String?

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty && !isSigningIn
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    colors: [
                        Color(.systemBackground),
                        Color.mint.opacity(0.12),
                        Color.blue.opacity(0.10),
                        Color.orange.opacity(0.08)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        header
                        form
                    }
                    .frame(maxWidth: 520)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 44)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationBarTitleDisplayMode(.inline)
            .alert(
                "Login Failed",
                isPresented: Binding(
                    get: { errorMessage != nil },
                    set: { newValue in
                        if !newValue {
                            errorMessage = nil
                        }
                    }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "Invalid credentials.")
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 18) {
            Image(systemName: "location.north.circle.fill")
                .font(.system(size: 58, weight: .semibold))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(.blue)
                .padding(8)
                .trackRunnerGlass(cornerRadius: 8, tint: .blue.opacity(0.14), interactive: true)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 8) {
                Text("TrackRunner")
                    .font(.largeTitle.bold())
                Text("Sign in to view assigned courier tasks, update delivery status, and collect required documents.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.top, 36)
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Email")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                TextField("runner@example.com", text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }
                    .disabled(isSigningIn)
                    .textFieldStyle(.plain)
                    .padding(13)
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Password")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .focused($focusedField, equals: .password)
                    .submitLabel(.go)
                    .onSubmit { submitIfPossible() }
                    .disabled(isSigningIn)
                    .textFieldStyle(.plain)
                    .padding(13)
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }

            Button {
                submitIfPossible()
            } label: {
                HStack(spacing: 10) {
                    if isSigningIn {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: "arrow.right.circle.fill")
                    }
                    Text(isSigningIn ? "Signing In" : "Sign In")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!canSubmit)
            .padding(.top, 6)
        }
        .padding(18)
        .trackRunnerGlass(cornerRadius: 8, tint: .blue.opacity(0.08))
    }

    private func submitIfPossible() {
        guard canSubmit else {
            return
        }

        isSigningIn = true
        Task {
            do {
                try await appState.login(email: email, password: password)
            } catch {
                errorMessage = error.localizedDescription
            }
            isSigningIn = false
        }
    }
}

private enum Field {
    case email
    case password
}

struct LoginView_Previews: PreviewProvider {
    static var previews: some View {
        LoginView()
            .environmentObject(AppState())
    }
}
